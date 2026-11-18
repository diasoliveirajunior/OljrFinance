// CRUD de cartoes de credito do Finance.
// Colecao: finance_cartoes/{auto}
//   { email, nome, bandeira, banco, limite, dia_fechamento, dia_vencimento, cor, criado_em }
// Fatura atual = soma de lancamentos tipo 'despesa' com cartao_id atual e data dentro do ciclo.

const admin = require('firebase-admin');

const BANDEIRAS_VALIDAS = ['visa', 'mastercard', 'elo', 'amex', 'hipercard', 'outra'];

function normalize(s) { return String(s == null ? '' : s).trim(); }
function num(v) { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function int(v, min, max) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return null;
    if (min !== undefined && n < min) return null;
    if (max !== undefined && n > max) return null;
    return n;
}

function cicloAtual(hoje, diaFechamento) {
    const y = hoje.getUTCFullYear(), m = hoje.getUTCMonth(), d = hoje.getUTCDate();
    if (d > diaFechamento) {
        const ini = new Date(Date.UTC(y, m, diaFechamento + 1));
        const fim = new Date(Date.UTC(y, m + 1, diaFechamento));
        return [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)];
    }
    const ini = new Date(Date.UTC(y, m - 1, diaFechamento + 1));
    const fim = new Date(Date.UTC(y, m, diaFechamento));
    return [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)];
}

async function faturaAtual(email, cartaoId, diaFechamento) {
    const [ini, fim] = cicloAtual(new Date(), diaFechamento);
    const snap = await admin.firestore().collection('finance_lancamentos')
        .where('email', '==', email)
        .where('cartao_id', '==', cartaoId)
        .get();
    let fatura = 0, limiteComprometido = 0;
    snap.forEach(d => {
        const l = d.data();
        if (l.tipo === 'despesa') {
            const v = Number(l.valor) || 0;
            limiteComprometido += v;
            if (l.data >= ini && l.data <= fim) fatura += v;
        }
    });
    return {
        fatura: Math.round(fatura * 100) / 100,
        limite_comprometido: Math.round(limiteComprometido * 100) / 100,
        ciclo_ini: ini,
        ciclo_fim: fim
    };
}

exports.listar = async (req, res) => {
    try {
        const email = req.user.email;
        const snap = await admin.firestore().collection('finance_cartoes')
            .where('email', '==', email).get();
        const cartoes = [];
        for (const d of snap.docs) {
            const data = d.data();
            const fat = await faturaAtual(email, d.id, data.dia_fechamento);
            const divida_inicial = Number(data.divida_inicial) || 0;
            const usado = fat.limite_comprometido + divida_inicial;
            const limite = Number(data.limite) || 0;
            const disponivel = Math.max(0, limite - usado);
            cartoes.push({
                id: d.id,
                nome: data.nome,
                bandeira: data.bandeira,
                banco: data.banco || null,
                limite,
                divida_inicial,
                dia_fechamento: data.dia_fechamento,
                dia_vencimento: data.dia_vencimento,
                cor: data.cor || '#64748b',
                fatura_atual: fat.fatura,
                limite_usado: Math.round(usado * 100) / 100,
                limite_disponivel: Math.round(disponivel * 100) / 100,
                ciclo_ini: fat.ciclo_ini,
                ciclo_fim: fat.ciclo_fim,
                percentual: limite > 0 ? Math.round((usado / limite) * 100) : 0
            });
        }
        cartoes.sort((a, b) => a.nome.localeCompare(b.nome));
        res.json({ cartoes });
    } catch (e) {
        console.error('cartoes.listar:', e);
        res.status(500).json({ error: 'Erro ao carregar cartoes.' });
    }
};

exports.criar = async (req, res) => {
    try {
        const nome = normalize(req.body.nome);
        const bandeira = normalize(req.body.bandeira).toLowerCase();
        const banco = normalize(req.body.banco);
        const limite = num(req.body.limite);
        const divida_inicial = num(req.body.divida_inicial);
        const dia_fechamento = int(req.body.dia_fechamento, 1, 31);
        const dia_vencimento = int(req.body.dia_vencimento, 1, 31);
        const cor = normalize(req.body.cor) || '#64748b';

        if (!nome) return res.status(400).json({ error: 'Apelido do cartao e obrigatorio.' });
        if (!BANDEIRAS_VALIDAS.includes(bandeira)) {
            return res.status(400).json({ error: 'Bandeira invalida. Use ' + BANDEIRAS_VALIDAS.join('/') + '.' });
        }
        if (dia_fechamento == null) return res.status(400).json({ error: 'Dia de fechamento invalido (1 a 31).' });
        if (dia_vencimento == null) return res.status(400).json({ error: 'Dia de vencimento invalido (1 a 31).' });

        const ref = await admin.firestore().collection('finance_cartoes').add({
            email: req.user.email,
            nome, bandeira, banco: banco || null, limite, divida_inicial,
            dia_fechamento, dia_vencimento, cor,
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            criado_por: req.user.email
        });
        res.status(201).json({ ok: true, id: ref.id, nome, bandeira, limite, divida_inicial, dia_fechamento, dia_vencimento, cor, fatura_atual: 0 });
    } catch (e) {
        console.error('cartoes.criar:', e);
        res.status(500).json({ error: 'Erro ao criar cartao.' });
    }
};

exports.atualizar = async (req, res) => {
    try {
        const ref = admin.firestore().collection('finance_cartoes').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists || snap.data().email !== req.user.email) {
            return res.status(404).json({ error: 'Cartao nao encontrado.' });
        }
        const patch = {};
        ['nome', 'banco', 'cor'].forEach(k => {
            if (req.body[k] !== undefined) patch[k] = normalize(req.body[k]) || null;
        });
        if (req.body.bandeira !== undefined) {
            const b = String(req.body.bandeira).toLowerCase();
            if (!BANDEIRAS_VALIDAS.includes(b)) return res.status(400).json({ error: 'Bandeira invalida.' });
            patch.bandeira = b;
        }
        if (req.body.limite !== undefined) patch.limite = num(req.body.limite);
        if (req.body.divida_inicial !== undefined) patch.divida_inicial = num(req.body.divida_inicial);
        if (req.body.dia_fechamento !== undefined) {
            const d = int(req.body.dia_fechamento, 1, 31);
            if (d == null) return res.status(400).json({ error: 'Dia de fechamento invalido.' });
            patch.dia_fechamento = d;
        }
        if (req.body.dia_vencimento !== undefined) {
            const d = int(req.body.dia_vencimento, 1, 31);
            if (d == null) return res.status(400).json({ error: 'Dia de vencimento invalido.' });
            patch.dia_vencimento = d;
        }
        patch.atualizado_em = admin.firestore.FieldValue.serverTimestamp();
        await ref.update(patch);
        res.json({ ok: true });
    } catch (e) {
        console.error('cartoes.atualizar:', e);
        res.status(500).json({ error: 'Erro ao atualizar cartao.' });
    }
};

exports.remover = async (req, res) => {
    try {
        const ref = admin.firestore().collection('finance_cartoes').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists || snap.data().email !== req.user.email) {
            return res.status(404).json({ error: 'Cartao nao encontrado.' });
        }
        const lancs = await admin.firestore().collection('finance_lancamentos')
            .where('email', '==', req.user.email)
            .where('cartao_id', '==', req.params.id).limit(1).get();
        if (!lancs.empty) {
            return res.status(400).json({
                error: 'Esse cartao tem lancamentos. Mova ou apague os lancamentos antes de remove-lo.'
            });
        }
        await ref.delete();
        res.json({ ok: true });
    } catch (e) {
        console.error('cartoes.remover:', e);
        res.status(500).json({ error: 'Erro ao remover cartao.' });
    }
};
