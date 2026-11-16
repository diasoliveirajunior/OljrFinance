// CRUD de investimentos do Finance.
// Colecao: finance_investimentos/{auto}
//   { email, nome, tipo, instituicao, valor_aplicado, valor_atual, rentabilidade_anual,
//     data_aplicacao (YYYY-MM-DD), vencimento (YYYY-MM-DD, opcional), observacao, cor, criado_em }

const admin = require('firebase-admin');

const TIPOS_VALIDOS = ['tesouro', 'cdb', 'lci', 'lca', 'fundo', 'acao', 'fii', 'cripto', 'poupanca', 'outro'];

function normalize(s) { return String(s == null ? '' : s).trim(); }
function num(v) { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function iso(s) {
    const str = normalize(s);
    return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
}

exports.listar = async (req, res) => {
    try {
        const snap = await admin.firestore().collection('finance_investimentos')
            .where('email', '==', req.user.email).get();
        const investimentos = [];
        snap.forEach(d => {
            const data = d.data();
            const aplicado = Number(data.valor_aplicado) || 0;
            const atual = Number(data.valor_atual) || aplicado;
            const rend_real = aplicado > 0 ? ((atual - aplicado) / aplicado) * 100 : 0;
            investimentos.push({
                id: d.id,
                nome: data.nome,
                tipo: data.tipo,
                instituicao: data.instituicao || null,
                valor_aplicado: aplicado,
                valor_atual: atual,
                rentabilidade_anual: Number(data.rentabilidade_anual) || 0,
                rentabilidade_real: Math.round(rend_real * 100) / 100,
                data_aplicacao: data.data_aplicacao || null,
                vencimento: data.vencimento || null,
                observacao: data.observacao || null,
                cor: data.cor || '#64748b'
            });
        });
        investimentos.sort((a, b) => b.valor_atual - a.valor_atual);
        res.json({ investimentos });
    } catch (e) {
        console.error('invest.listar:', e);
        res.status(500).json({ error: 'Erro ao carregar investimentos.' });
    }
};

exports.criar = async (req, res) => {
    try {
        const nome = normalize(req.body.nome);
        const tipo = normalize(req.body.tipo).toLowerCase();
        const instituicao = normalize(req.body.instituicao);
        const valor_aplicado = num(req.body.valor_aplicado);
        const valor_atual = req.body.valor_atual !== undefined ? num(req.body.valor_atual) : valor_aplicado;
        const rentabilidade_anual = num(req.body.rentabilidade_anual);
        const data_aplicacao = iso(req.body.data_aplicacao);
        const vencimento = iso(req.body.vencimento);
        const observacao = normalize(req.body.observacao);
        const cor = normalize(req.body.cor) || '#64748b';

        if (!nome) return res.status(400).json({ error: 'Nome e obrigatorio.' });
        if (!TIPOS_VALIDOS.includes(tipo)) {
            return res.status(400).json({ error: 'Tipo invalido. Use ' + TIPOS_VALIDOS.join('/') + '.' });
        }
        if (!data_aplicacao) return res.status(400).json({ error: 'Data de aplicacao invalida (use YYYY-MM-DD).' });

        const ref = await admin.firestore().collection('finance_investimentos').add({
            email: req.user.email,
            nome, tipo, instituicao: instituicao || null,
            valor_aplicado, valor_atual, rentabilidade_anual,
            data_aplicacao, vencimento: vencimento || null,
            observacao: observacao || null, cor,
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            criado_por: req.user.email
        });
        res.status(201).json({ ok: true, id: ref.id });
    } catch (e) {
        console.error('invest.criar:', e);
        res.status(500).json({ error: 'Erro ao criar investimento.' });
    }
};

exports.atualizar = async (req, res) => {
    try {
        const ref = admin.firestore().collection('finance_investimentos').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists || snap.data().email !== req.user.email) {
            return res.status(404).json({ error: 'Investimento nao encontrado.' });
        }
        const patch = {};
        ['nome', 'instituicao', 'observacao', 'cor'].forEach(k => {
            if (req.body[k] !== undefined) patch[k] = normalize(req.body[k]) || null;
        });
        if (req.body.tipo !== undefined) {
            const t = String(req.body.tipo).toLowerCase();
            if (!TIPOS_VALIDOS.includes(t)) return res.status(400).json({ error: 'Tipo invalido.' });
            patch.tipo = t;
        }
        ['valor_aplicado', 'valor_atual', 'rentabilidade_anual'].forEach(k => {
            if (req.body[k] !== undefined) patch[k] = num(req.body[k]);
        });
        if (req.body.data_aplicacao !== undefined) {
            const d = iso(req.body.data_aplicacao);
            if (!d) return res.status(400).json({ error: 'Data invalida.' });
            patch.data_aplicacao = d;
        }
        if (req.body.vencimento !== undefined) {
            patch.vencimento = req.body.vencimento ? iso(req.body.vencimento) : null;
        }
        patch.atualizado_em = admin.firestore.FieldValue.serverTimestamp();
        await ref.update(patch);
        res.json({ ok: true });
    } catch (e) {
        console.error('invest.atualizar:', e);
        res.status(500).json({ error: 'Erro ao atualizar investimento.' });
    }
};

exports.remover = async (req, res) => {
    try {
        const ref = admin.firestore().collection('finance_investimentos').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists || snap.data().email !== req.user.email) {
            return res.status(404).json({ error: 'Investimento nao encontrado.' });
        }
        await ref.delete();
        res.json({ ok: true });
    } catch (e) {
        console.error('invest.remover:', e);
        res.status(500).json({ error: 'Erro ao remover investimento.' });
    }
};

exports.patrimonio = async (req, res) => {
    try {
        const email = req.user.email;
        const db = admin.firestore();
        const [contasSnap, invSnap, cartoesSnap] = await Promise.all([
            db.collection('finance_contas').where('email', '==', email).get(),
            db.collection('finance_investimentos').where('email', '==', email).get(),
            db.collection('finance_cartoes').where('email', '==', email).get()
        ]);
        // Saldo das contas
        let totalContas = 0;
        const contaIds = [];
        contasSnap.forEach(d => {
            contaIds.push({id: d.id, saldo_inicial: Number(d.data().saldo_inicial) || 0});
        });
        const lancsSnap = await db.collection('finance_lancamentos').where('email', '==', email).get();
        const porConta = {};
        const porCartao = {};
        let totalRecMes = 0, totalDespMes = 0;
        const hoje = new Date();
        const mesIni = hoje.toISOString().slice(0, 7) + '-01';
        lancsSnap.forEach(d => {
            const l = d.data();
            const v = Number(l.valor) || 0;
            if (l.conta_id) {
                porConta[l.conta_id] = (porConta[l.conta_id] || 0) + (l.tipo === 'receita' ? v : -v);
            }
            if (l.cartao_id && l.tipo === 'despesa') {
                porCartao[l.cartao_id] = (porCartao[l.cartao_id] || 0) + v;
            }
            if (l.data >= mesIni) {
                if (l.tipo === 'receita') totalRecMes += v;
                else totalDespMes += v;
            }
        });
        contaIds.forEach(c => {
            totalContas += c.saldo_inicial + (porConta[c.id] || 0);
        });
        // Investimentos
        let totalInvestido = 0, totalAtual = 0;
        invSnap.forEach(d => {
            const i = d.data();
            totalInvestido += Number(i.valor_aplicado) || 0;
            totalAtual += Number(i.valor_atual) || 0;
        });
        // Faturas abertas dos cartoes (passivo - nao soma no patrimonio liquido mas mostra como alerta)
        let totalFaturas = 0;
        cartoesSnap.forEach(d => {
            const c = d.data();
            totalFaturas += porCartao[d.id] || 0;
        });

        res.json({
            patrimonio_total: Math.round((totalContas + totalAtual) * 100) / 100,
            contas: Math.round(totalContas * 100) / 100,
            investimentos: Math.round(totalAtual * 100) / 100,
            investimentos_aplicado: Math.round(totalInvestido * 100) / 100,
            faturas_abertas: Math.round(totalFaturas * 100) / 100,
            receita_mes: Math.round(totalRecMes * 100) / 100,
            despesa_mes: Math.round(totalDespMes * 100) / 100,
            saldo_mes: Math.round((totalRecMes - totalDespMes) * 100) / 100
        });
    } catch (e) {
        console.error('patrimonio:', e);
        res.status(500).json({ error: 'Erro ao calcular patrimonio.' });
    }
};
