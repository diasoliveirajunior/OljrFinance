const admin = require('firebase-admin');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { validateRows, hash } = require('./finance-import');

exports.previa = async (req, res) => {
    try {
        const result = await new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'finance-import-worker.js'), {
                workerData: req.body, resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 },
            });
            const timer = setTimeout(() => { void worker.terminate(); reject(new Error('Leitura demorou demais. Divida o arquivo ou exporte CSV/OFX.')); }, 25000);
            worker.once('message', message => { clearTimeout(timer); void worker.terminate(); message.error ? reject(new Error(message.error)) : resolve(message.result); });
            worker.once('error', () => { clearTimeout(timer); reject(new Error('Não foi possível ler o arquivo. Confira o formato e tente um arquivo menor.')); });
            worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new Error('Não foi possível concluir a leitura. Tente um arquivo menor.')); });
        });
        res.json(result);
    } catch (error) {
        // Mensagens de bibliotecas podem conter trechos do arquivo; devolvemos apenas erros conhecidos.
        const message = String(error.message || '');
        const safe = /^(Use OFX|Arquivo |Escolha |Planilha |Divida |Linha |CSV |Não |PDF |Leitura |Confira )/.test(message);
        res.status(400).json({ error: safe ? message : 'Não foi possível ler o arquivo. Verifique se está íntegro e sem senha.' });
    }
};

exports.confirmar = async (req, res) => {
    let rows;
    try { rows = validateRows(req.body.lancamentos); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const conta = String(req.body.conta_id || '').trim();
    const cartao = String(req.body.cartao_id || '').trim();
    if (Boolean(conta) === Boolean(cartao) || /\//.test(conta + cartao)) return res.status(400).json({ error: 'Escolha uma conta OU um cartão.' });
    const formato = req.body.formato;
    if (!['ofx', 'xlsx', 'csv', 'pdf'].includes(formato)) return res.status(400).json({ error: 'Formato de origem inválido.' });
    const email = req.user.email;
    const db = admin.firestore();
    const target = db.collection(conta ? 'finance_contas' : 'finance_cartoes').doc(conta || cartao);
    try {
        // Grava em transação única: ou todos os selecionados entram, ou nenhum entra.
        // O limite de 400 mantém a operação abaixo dos 500 writes do Firestore.
        if (rows.length > 400) return res.status(400).json({ error: 'Selecione até 400 lançamentos por confirmação.' });
        const collection = db.collection('finance_lancamentos');
        const unique = new Map();
        for (const r of rows) {
            const id = hash(JSON.stringify([email, conta || null, cartao || null, formato, r.sourceId]));
            if (unique.has(id) && JSON.stringify(unique.get(id)) !== JSON.stringify(r)) {
                return res.status(400).json({ error: 'Há lançamentos diferentes com o mesmo identificador no arquivo. Importe apenas um deles após conferir a origem.' });
            }
            unique.set(id, r);
        }
        const result = await db.runTransaction(async tx => {
            const owner = await tx.get(target);
            if (!owner.exists || owner.data().email !== email) return null;
            const entries = [...unique.entries()];
            const existing = await tx.getAll(...entries.map(([id]) => collection.doc(`import_${id}`)));
            // Compatibilidade com OFX gravado antes desta entrega, sempre respeitando o destino.
            const legacy = new Set();
            const fitids = [...new Set(rows.map(r => r.fitid).filter(Boolean))];
            for (let i = 0; i < fitids.length; i += 30) {
                const snapshot = await tx.get(collection.where('email', '==', email).where('ofx_fitid', 'in', fitids.slice(i, i + 30)));
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if ((data.conta_id || '') === conta && (data.cartao_id || '') === cartao) legacy.add(data.ofx_fitid);
                });
            }
            let imported = 0;
            entries.forEach(([id, r], i) => {
                if (existing[i].exists || (formato === 'ofx' && r.fitid && legacy.has(r.fitid))) return;
                tx.create(collection.doc(`import_${id}`), {
                    email, data: r.data, descricao: r.descricao, valor: r.valor, tipo: r.tipo, categoria: r.categoria,
                    conta_id: conta || null, cartao_id: cartao || null, forma_pagamento: cartao ? 'credito' : 'extrato',
                    origem: formato, import_source_id: r.sourceId,
                    ...(formato === 'ofx' ? { ofx_fitid: r.fitid } : {}),
                    criado_em: admin.firestore.FieldValue.serverTimestamp(), criado_por: email,
                });
                imported++;
            });
            return { importadas: imported, duplicadas: rows.length - imported };
        });
        if (!result) return res.status(400).json({ error: 'Conta ou cartão não encontrado para este usuário.' });
        res.json({ ok: true, ...result });
    } catch {
        res.status(500).json({ error: 'Não foi possível confirmar a importação. Nenhum lançamento desta tentativa foi gravado. Você pode tentar novamente.' });
    }
};
