const admin = require('firebase-admin');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { validateRows, hash } = require('./finance-import');
let activePreviews = 0;

exports.previa = async (req, res) => {
    if (activePreviews >= 2) return res.status(429).json({ error: 'Há outras leituras em andamento. Aguarde alguns segundos e tente novamente.' });
    activePreviews++;
    try {
        let payload = req.body, source;
        if (req.body.drive_file_id) {
            source = await require('./finance-google-drive').download(req.user.email, req.firebaseUid, req.body.drive_file_id);
            payload = { ...req.body, nome: source.nome, arquivo: source.arquivo };
        }
        const result = await new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'finance-import-worker.js'), {
                workerData: payload, resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 },
            });
            const timer = setTimeout(() => { void worker.terminate(); reject(new Error('Leitura demorou demais. Divida o arquivo ou exporte CSV/OFX.')); }, 25000);
            worker.once('message', message => { clearTimeout(timer); void worker.terminate(); message.error ? reject(new Error(message.error)) : resolve(message.result); });
            worker.once('error', () => { clearTimeout(timer); reject(new Error('Não foi possível ler o arquivo. Confira o formato e tente um arquivo menor.')); });
            worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new Error('Não foi possível concluir a leitura. Tente um arquivo menor.')); });
        });
        res.json({ ...result, ...(source ? { drive: source.drive } : {}) });
    } catch (error) {
        // Mensagens de bibliotecas podem conter trechos do arquivo; devolvemos apenas erros conhecidos.
        const message = String(error.publicMessage || error.message || '');
        const safe = /^(Use OFX|Arquivo |Escolha |Planilha |Divida |Linha |CSV |Não |PDF |Leitura |Confira )/.test(message);
        if (req.body.drive_file_id && !error.publicMessage && !safe) return res.status(400).json({ error: 'Não foi possível ler o arquivo do Drive. Confira o acesso, o formato e a conexão.' });
        res.status(error.publicMessage ? error.status : 400).json({ error: error.publicMessage || (safe ? message : 'Não foi possível ler o arquivo. Verifique se está íntegro e sem senha.') });
    } finally { activePreviews--; }
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
        let cloud;
        if (req.body.drive) cloud = await require('./finance-google-drive').validateSource(email, req.firebaseUid, req.body.drive, formato);
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
            if (cloud) {
                const connection = await tx.get(db.collection('finance_storage_connections').doc(`${email}__google`));
                const state = connection.exists ? connection.data() : null;
                if (!state?.ativo || state.revision !== cloud.revision || state.pasta_id !== cloud.pasta_id || state.uid !== req.firebaseUid) throw new Error('Conexão alterada durante a confirmação');
            }
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
                    ...(cloud ? { drive_file_id: cloud.file_id, drive_versao: cloud.versao } : {}),
                    criado_em: admin.firestore.FieldValue.serverTimestamp(), criado_por: email,
                });
                imported++;
            });
            if (cloud) {
                const { registryId } = require('./finance-google-drive').internals;
                tx.set(db.collection('finance_drive_revisoes').doc(registryId(email, conta, cartao, cloud.file_id)), {
                    email, conta_id: conta || null, cartao_id: cartao || null,
                    file_id: cloud.file_id, versao: cloud.versao, selecionadas: rows.length,
                    atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            return { importadas: imported, duplicadas: rows.length - imported };
        });
        if (!result) return res.status(400).json({ error: 'Conta ou cartão não encontrado para este usuário.' });
        res.json({ ok: true, ...result });
    } catch (err) {
        if (err.publicMessage) return res.status(err.status).json({ error: err.publicMessage });
        res.status(500).json({ error: 'Não foi possível confirmar a importação. Nenhum lançamento desta tentativa foi gravado. Você pode tentar novamente.' });
    }
};
