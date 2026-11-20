// CRUD de contas bancarias do Finance.
// Cada usuario tem suas proprias contas (isolamento por email).
// Coecao: finance_contas/{auto}
//   { email, nome, banco, tipo: 'corrente'|'poupanca'|'carteira'|'outra',
//     cor, saldo_inicial, saldo_atual (derivado), criado_em }

const admin = require('firebase-admin');

const TIPOS_VALIDOS = ['corrente', 'poupanca', 'carteira', 'outra'];

// Aceita um tipo pre-definido OU um texto livre (max 40 chars) pra "Outro...".
function sanitizeTipo(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    if (TIPOS_VALIDOS.includes(s)) return s;
    return s.slice(0, 40);
}

function normalize(s) {
    return String(s == null ? '' : s).trim();
}
function num(v) {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

exports.listar = async (req, res) => {
    try {
        const records = await require('./finance-balances').load(admin.firestore(), req.user.email);
        const contas = records.map(({id, data, balance}) => ({
            id, nome: data.banco || data.nome || 'Conta', banco: data.banco || data.nome || 'Conta',
            tipo: data.tipo, cor: data.cor || '#64748b', saldo_inicial: Number(data.saldo_inicial) || 0,
            observacao: data.observacao || null, criado_em: data.criado_em || null, ...balance,
        }));
        contas.sort((a,b) => a.nome.localeCompare(b.nome));
        res.json({ contas });
    } catch {
        res.status(500).json({ error: 'Não foi possível consultar os saldos e a conciliação das contas.' });
    }
};

exports.criar = async (req, res) => {
    try {
        // A partir de 18/11 o front envia apenas 'banco' como identificacao da conta.
        // Aceita 'nome' por compatibilidade com clientes antigos.
        const banco = normalize(req.body.banco) || normalize(req.body.nome);
        const tipo = sanitizeTipo(req.body.tipo);
        const cor = normalize(req.body.cor) || '#64748b';
        const saldo_inicial = num(req.body.saldo_inicial);
        const observacao = normalize(req.body.observacao);

        if (!banco) return res.status(400).json({ error: 'Informe o banco/instituicao.' });
        if (!tipo) return res.status(400).json({ error: 'Informe o tipo da conta.' });

        const doc = {
            email: req.user.email,
            nome: banco, banco, tipo, cor,
            saldo_inicial,
            observacao: observacao || null,
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            criado_por: req.user.email
        };
        const ref = await admin.firestore().collection('finance_contas').add(doc);
        res.status(201).json({ ok: true, id: ref.id, nome: banco, banco, tipo, cor, saldo_inicial, saldo_atual: saldo_inicial });
    } catch (e) {
        console.error('contas.criar:', e);
        res.status(500).json({ error: 'Erro ao criar conta.' });
    }
};

exports.atualizar = async (req, res) => {
    try {
        const ref = admin.firestore().collection('finance_contas').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists || snap.data().email !== req.user.email) {
            return res.status(404).json({ error: 'Conta nao encontrada.' });
        }
        const patch = {};
        ['nome', 'banco', 'cor', 'observacao'].forEach(k => {
            if (req.body[k] !== undefined) patch[k] = normalize(req.body[k]) || null;
        });
        if (req.body.tipo !== undefined) {
            const t = sanitizeTipo(req.body.tipo);
            if (!t) return res.status(400).json({ error: 'Tipo invalido.' });
            patch.tipo = t;
        }
        if (req.body.saldo_inicial !== undefined) patch.saldo_inicial = num(req.body.saldo_inicial);
        patch.atualizado_em = admin.firestore.FieldValue.serverTimestamp();
        await ref.update(patch);
        res.json({ ok: true });
    } catch (e) {
        console.error('contas.atualizar:', e);
        res.status(500).json({ error: 'Erro ao atualizar conta.' });
    }
};

exports.remover = async (req, res) => {
    try {
        const ref = admin.firestore().collection('finance_contas').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists || snap.data().email !== req.user.email) {
            return res.status(404).json({ error: 'Conta nao encontrada.' });
        }
        // Verifica se ha lancamentos atrelados antes de remover.
        const lancs = await admin.firestore().collection('finance_lancamentos')
            .where('email', '==', req.user.email)
            .where('conta_id', '==', req.params.id).limit(1).get();
        if (!lancs.empty) {
            return res.status(400).json({
                error: 'Essa conta tem lancamentos. Mova ou apague os lancamentos antes de remove-la.'
            });
        }
        await ref.delete();
        res.json({ ok: true });
    } catch (e) {
        console.error('contas.remover:', e);
        res.status(500).json({ error: 'Erro ao remover conta.' });
    }
};
