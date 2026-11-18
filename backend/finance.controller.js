// Backend do painel Finance — controle financeiro pessoal/familiar.
//
// Coleção: finance_lancamentos/{auto}
//   { email, data (YYYY-MM-DD), descricao, categoria, valor (number), tipo: 'receita'|'despesa',
//     criado_em, criado_por }
//
// Cada usuário vê SÓ os próprios lançamentos (filtro por req.user.email).
// Quando o papel for co_gestor (família), futuras versões podem ampliar pra ver
// lançamentos de "domicilio" inteiro — por enquanto isolamento individual.

const admin = require('firebase-admin');

const TIPO_VALIDOS = ['receita', 'despesa'];
const CATEGORIAS_DEFAULT = [
    'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Educação',
    'Lazer', 'Vestuário', 'Salário', 'Investimento', 'Transferência', 'Outros'
];

// Preferencias do painel Finance por usuario. Cada pessoa escolhe quais
// secoes quer ver no dashboard. Default: tudo visivel. Contas sempre mostra
// porque precisa delas pra qualquer lancamento.
function defaultPrefs() {
    return {
        mostrar_cartoes: true,
        mostrar_investimentos: true,
        mostrar_veiculo: true,
        mostrar_grupo_familiar: true
    };
}

exports.preferencias = async (req, res) => {
    try {
        const snap = await admin.firestore().collection('finance_preferencias')
            .doc(req.user.email).get();
        const data = snap.exists ? snap.data() : {};
        res.json({
            mostrar_cartoes: data.mostrar_cartoes !== false,
            mostrar_investimentos: data.mostrar_investimentos !== false,
            mostrar_veiculo: data.mostrar_veiculo !== false,
            mostrar_grupo_familiar: data.mostrar_grupo_familiar !== false
        });
    } catch (e) {
        console.error('finance.preferencias:', e);
        res.status(500).json(defaultPrefs());
    }
};

exports.salvarPreferencias = async (req, res) => {
    try {
        const patch = {
            email: req.user.email,
            atualizado_em: admin.firestore.FieldValue.serverTimestamp()
        };
        ['mostrar_cartoes', 'mostrar_investimentos', 'mostrar_veiculo', 'mostrar_grupo_familiar']
            .forEach(k => { if (req.body[k] !== undefined) patch[k] = !!req.body[k]; });
        await admin.firestore().collection('finance_preferencias')
            .doc(req.user.email).set(patch, { merge: true });
        res.json({ ok: true });
    } catch (e) {
        console.error('finance.salvarPreferencias:', e);
        res.status(500).json({ error: 'Erro ao salvar preferências.' });
    }
};

// Heurística de auto-categorização a partir da descrição do lançamento OFX.
// Ordem importa: primeira palavra-chave que casar vence.
const REGRAS_CATEGORIA = [
    { cat: 'Alimentação', keys: ['mercado', 'supermerc', 'atacadao', 'atacadão', 'carrefour', 'assaí', 'assai', 'extra', 'pão', 'padaria', 'ifood', 'uber eats', 'rappi', 'restaurante', 'lanchonete', 'pizzaria', 'burger', 'mcdonald', 'subway', 'kfc'] },
    { cat: 'Transporte',  keys: ['uber', '99app', '99 pop', 'taxi', 'táxi', 'posto', 'shell', 'ipiranga', 'petrobras', 'br mania', 'combustivel', 'combustível', 'estacionamento', 'pedagio', 'pedágio', 'metro', 'metrô', 'onibus', 'ônibus', 'bilhete unico'] },
    { cat: 'Moradia',     keys: ['aluguel', 'condominio', 'condomínio', 'energia', 'eletric', 'agua ', 'água ', 'sabesp', 'sanepar', 'copel', 'cemig', 'iptu', 'gas ', 'gás ', 'internet', 'vivo fibra', 'claro net', 'oi fibra', 'tim live'] },
    { cat: 'Saúde',       keys: ['farmac', 'farmácia', 'drogaria', 'droga raia', 'pague menos', 'panvel', 'ultrafarma', 'hospital', 'clinica', 'clínica', 'consulta', 'exame lab', 'unimed', 'amil', 'bradesco saude', 'psicolog', 'dentist', 'odontolog'] },
    { cat: 'Educação',    keys: ['escola', 'colegio', 'colégio', 'universidade', 'faculdade', 'curso ', 'alura', 'udemy', 'coursera', 'rocketseat', 'mensalidade escolar'] },
    { cat: 'Lazer',       keys: ['netflix', 'spotify', 'disney', 'prime video', 'hbo', 'globoplay', 'deezer', 'youtube premium', 'apple music', 'crunchyroll', 'steam', 'playstation', 'xbox', 'nintendo', 'cinema', 'ingresso', 'show ', 'teatro'] },
    { cat: 'Vestuário',   keys: ['zara', 'renner', 'riachuelo', 'c&a', 'c e a', 'lojas americanas', 'shopping', 'calçados', 'calcados'] },
    { cat: 'Salário',     keys: ['salario', 'salário', 'holerite', 'pagamento seduc', 'pagamento contra-cheque', 'proventos', 'remuneracao', 'remuneração'] },
    { cat: 'Investimento',keys: ['tesouro direto', 'nubank rendeu', 'cdb', 'rdb', 'lci', 'lca', 'debentures', 'debêntures', 'fundo de invest', 'xp invest', 'clear corretora', 'rico invest', 'nu invest', 'nuinvest', 'inter invest', 'binance', 'mercado bitcoin'] },
    { cat: 'Transferência', keys: ['pix enviado', 'pix recebido', 'transferencia', 'transferência', 'ted ', 'doc ', 'p2p'] }
];

function categorizarAutomatico(descricao) {
    const d = String(descricao || '').toLowerCase();
    for (const regra of REGRAS_CATEGORIA) {
        for (const k of regra.keys) {
            if (d.includes(k)) return regra.cat;
        }
    }
    return 'Outros';
}

exports.categorizarAutomatico = categorizarAutomatico;

// Parser OFX minimalista. Aceita OFX 1.x (SGML) e OFX 2.x (XML).
// Extrai blocos STMTTRN e retorna array {fitid, data, valor, tipo, descricao}.
function parseOfx(content) {
    if (!content || typeof content !== 'string') return [];
    const transacoes = [];
    // Normaliza: remove BOM, remove CDATA-esque, colapsa whitespace mínimo.
    let txt = content.replace(/^﻿/, '');
    // Regex tolerante — funciona pra OFX SGML (tags soltas) e XML (tags fechadas).
    const blocos = txt.match(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) || [];
    for (const bloco of blocos) {
        const get = (tag) => {
            const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
            const m = bloco.match(re);
            return m ? m[1].trim() : '';
        };
        const trntype = get('TRNTYPE').toUpperCase();
        const dtposted = get('DTPOSTED');
        const trnamt = get('TRNAMT');
        const fitid = get('FITID');
        const memo = get('MEMO');
        const name = get('NAME');
        if (!dtposted || !trnamt || !fitid) continue;

        // DTPOSTED formato YYYYMMDD ou YYYYMMDDhhmmss[.xxx][+TZ]
        const dataIso = `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`;
        const valorNum = parseFloat(String(trnamt).replace(',', '.'));
        if (isNaN(valorNum) || valorNum === 0) continue;

        // Regra de tipo: TRNTYPE CREDIT/DEP = receita; DEBIT/POS/CHECK = despesa;
        // fallback pelo sinal do valor.
        let tipo;
        if (['CREDIT', 'DEP', 'INT', 'DIV'].includes(trntype)) tipo = 'receita';
        else if (['DEBIT', 'POS', 'CHECK', 'PAYMENT', 'ATM', 'CASH', 'XFER'].includes(trntype)) tipo = 'despesa';
        else tipo = valorNum > 0 ? 'receita' : 'despesa';

        const descricao = [memo, name].filter(Boolean).join(' — ').slice(0, 200) || 'Sem descrição';
        const categoria = categorizarAutomatico(descricao);

        transacoes.push({
            fitid: fitid,
            data: dataIso,
            valor: Math.abs(valorNum),
            tipo: tipo,
            descricao: descricao,
            categoria: categoria
        });
    }
    return transacoes;
}

// POST /api/finance/importar-ofx
// { ofxContent: string, banco?: string, conta_id?: string, cartao_id?: string, preview_only?: boolean }
// Se preview_only=true, parseia e retorna transacoes sem gravar nada.
// conta_id e cartao_id sao mutuamente exclusivos; todos os lancamentos criados
// recebem o id escolhido (geralmente conta_id, cartao_id so em imports de fatura).
exports.importarOfx = async (req, res) => {
    try {
        const email = req.user.email;
        const ofxContent = String(req.body.ofxContent || '');
        const banco = String(req.body.banco || 'Banco').trim().slice(0, 60);
        const conta_id = String(req.body.conta_id || '').trim() || null;
        const cartao_id = String(req.body.cartao_id || '').trim() || null;
        const preview_only = req.body.preview_only === true;
        if (conta_id && cartao_id) {
            return res.status(400).json({ error: 'Escolha uma conta OU um cartão, não ambos.' });
        }

        if (!ofxContent || ofxContent.length < 50) {
            return res.status(400).json({ error: 'Arquivo OFX vazio ou inválido.' });
        }
        if (ofxContent.length > 5 * 1024 * 1024) {
            return res.status(413).json({ error: 'Arquivo muito grande (limite 5 MB).' });
        }

        const transacoes = parseOfx(ofxContent);
        if (transacoes.length === 0) {
            return res.status(400).json({ error: 'Nenhuma transação encontrada no arquivo. Confira se é OFX válido.' });
        }

        const db = admin.firestore();

        // Modo preview: so retorna lista parseada, nao grava.
        if (preview_only) {
            return res.json({
                ok: true,
                preview_only: true,
                totalNoArquivo: transacoes.length,
                preview: transacoes.slice(0, 25).map(t => ({
                    fitid: t.fitid, data: t.data, descricao: t.descricao,
                    valor: t.valor, tipo: t.tipo, categoria: t.categoria
                }))
            });
        }

        // Valida posse do destino antes de gravar.
        if (conta_id) {
            const c = await db.collection('finance_contas').doc(conta_id).get();
            if (!c.exists || c.data().email !== email) return res.status(400).json({ error: 'Conta inválida.' });
        }
        if (cartao_id) {
            const c = await db.collection('finance_cartoes').doc(cartao_id).get();
            if (!c.exists || c.data().email !== email) return res.status(400).json({ error: 'Cartão inválido.' });
        }

        let importadas = 0, duplicadas = 0;
        for (const tx of transacoes) {
            const dup = await db.collection('finance_lancamentos')
                .where('email', '==', email)
                .where('ofx_fitid', '==', tx.fitid)
                .limit(1).get();
            if (!dup.empty) { duplicadas++; continue; }

            await db.collection('finance_lancamentos').add({
                email: email,
                data: tx.data,
                descricao: tx.descricao,
                categoria: tx.categoria,
                valor: tx.valor,
                tipo: tx.tipo,
                conta_id, cartao_id,
                forma_pagamento: cartao_id ? 'credito' : 'extrato',
                origem: 'ofx',
                ofx_fitid: tx.fitid,
                ofx_banco: banco,
                criado_em: admin.firestore.FieldValue.serverTimestamp(),
                criado_por: email
            });
            importadas++;
        }

        res.json({
            ok: true,
            importadas: importadas,
            duplicadas: duplicadas,
            totalNoArquivo: transacoes.length,
            preview: transacoes.slice(0, 5).map(t => ({
                data: t.data, descricao: t.descricao, valor: t.valor, tipo: t.tipo, categoria: t.categoria
            }))
        });
    } catch (e) {
        console.error('finance.importarOfx:', e);
        res.status(500).json({ error: 'Erro ao importar OFX: ' + e.message });
    }
};

function sanitizeData(v) {
    const s = String(v || '').trim();
    // Aceita YYYY-MM-DD ou ISO. Devolve YYYY-MM-DD ou null.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function sanitizeValor(v) {
    if (typeof v === 'number') return Math.abs(v);
    const n = Number(String(v).replace(',', '.'));
    if (isNaN(n)) return null;
    return Math.abs(n);
}

// GET /api/finance/lancamentos?desde=YYYY-MM-DD&ate=YYYY-MM-DD&limit=200
exports.listarLancamentos = async (req, res) => {
    try {
        const email = req.user.email;
        const desde = sanitizeData(req.query.desde);
        const ate = sanitizeData(req.query.ate);
        let limit = parseInt(req.query.limit, 10);
        if (isNaN(limit) || limit <= 0 || limit > 1000) limit = 200;

        const db = admin.firestore();
        let q = db.collection('finance_lancamentos').where('email', '==', email);
        if (desde) q = q.where('data', '>=', desde);
        if (ate) q = q.where('data', '<=', ate);
        let snap;
        try { snap = await q.orderBy('data', 'desc').limit(limit).get(); }
        catch (_) { snap = await q.limit(limit).get(); }

        const lancamentos = [];
        snap.forEach(function (d) { lancamentos.push(Object.assign({ id: d.id }, d.data())); });
        res.json({ ok: true, lancamentos: lancamentos });
    } catch (e) {
        console.error('finance.listarLancamentos:', e);
        res.status(500).json({ error: 'Erro ao listar lançamentos.' });
    }
};

// Formas de pagamento aceitas. 'extrato' = movimentacao direta da conta
// (debito em conta, boleto, etc). Separar isso permite filtros no extrato
// sem misturar com a categoria (Mercado/Combustivel/Salario...).
const FORMAS_PAGAMENTO = ['extrato', 'debito', 'credito', 'transferencia', 'pix', 'dinheiro'];

// POST /api/finance/lancamentos
// { data, descricao, categoria, valor, tipo, conta_id?, cartao_id?,
//   forma_pagamento?, origem_texto?, litros?, odometro? }
// conta_id e cartao_id sao mutuamente exclusivos. origem_texto so faz sentido em receitas
// (ex: "SEDUC", "Freelance X"). Despesas usam a descricao como estabelecimento.
// litros e odometro so fazem sentido em categoria 'Combustivel' — permitem calcular
// consumo (km/l) e preco medio por litro.
exports.adicionarLancamento = async (req, res) => {
    try {
        const email = req.user.email;
        const data = sanitizeData(req.body.data);
        const descricao = String(req.body.descricao || '').trim().slice(0, 200);
        const categoria = String(req.body.categoria || 'Outros').trim().slice(0, 60);
        const valor = sanitizeValor(req.body.valor);
        const tipo = String(req.body.tipo || '').trim().toLowerCase();
        const conta_id = String(req.body.conta_id || '').trim() || null;
        const cartao_id = String(req.body.cartao_id || '').trim() || null;
        const origem_texto = String(req.body.origem_texto || '').trim().slice(0, 120) || null;

        const forma_raw = String(req.body.forma_pagamento || '').trim().toLowerCase();
        const forma_pagamento = FORMAS_PAGAMENTO.includes(forma_raw) ? forma_raw
            : (cartao_id ? 'credito' : 'extrato');

        const litros_n = Number(String(req.body.litros || '').replace(',', '.'));
        const odom_n = Number(String(req.body.odometro || '').replace(',', '.'));
        const litros = Number.isFinite(litros_n) && litros_n > 0 ? Math.round(litros_n * 1000) / 1000 : null;
        const odometro = Number.isFinite(odom_n) && odom_n > 0 ? Math.round(odom_n) : null;

        if (!data) return res.status(400).json({ error: 'Data inválida (use YYYY-MM-DD).' });
        if (!descricao) return res.status(400).json({ error: 'Descrição é obrigatória.' });
        if (valor === null || valor === 0) return res.status(400).json({ error: 'Valor inválido.' });
        if (!TIPO_VALIDOS.includes(tipo)) return res.status(400).json({ error: "Tipo deve ser 'receita' ou 'despesa'." });
        if (conta_id && cartao_id) return res.status(400).json({ error: 'Lançamento deve ser em uma conta OU em um cartão, não ambos.' });

        const db = admin.firestore();
        if (conta_id) {
            const c = await db.collection('finance_contas').doc(conta_id).get();
            if (!c.exists || c.data().email !== email) return res.status(400).json({ error: 'Conta inválida.' });
        }
        if (cartao_id) {
            const c = await db.collection('finance_cartoes').doc(cartao_id).get();
            if (!c.exists || c.data().email !== email) return res.status(400).json({ error: 'Cartão inválido.' });
        }

        const doc = {
            email, data, descricao, categoria, valor, tipo,
            conta_id, cartao_id, origem_texto, forma_pagamento,
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            criado_por: email
        };
        if (litros != null) doc.litros = litros;
        if (odometro != null) doc.odometro = odometro;
        const ref = await db.collection('finance_lancamentos').add(doc);
        res.status(201).json({ ok: true, id: ref.id });
    } catch (e) {
        console.error('finance.adicionarLancamento:', e);
        res.status(500).json({ error: 'Erro ao adicionar lançamento.' });
    }
};

// GET /api/finance/combustivel
// Agrega consumo medio (km/l), preco medio litro, total litros e km rodados no mes.
// Precisa de 2+ lançamentos de combustivel COM odometro para calcular km/l
// (diferenca entre abastecimentos / litros do abastecimento anterior).
exports.combustivel = async (req, res) => {
    try {
        const email = req.user.email;
        const snap = await admin.firestore().collection('finance_lancamentos')
            .where('email', '==', email).where('categoria', '==', 'Combustível').get();
        const tanques = [];
        snap.forEach(d => {
            const l = d.data();
            if (l.litros > 0) tanques.push({ data: l.data, valor: l.valor, litros: l.litros, odometro: l.odometro || null });
        });
        tanques.sort((a, b) => a.data.localeCompare(b.data));

        const mesAtual = new Date().toISOString().slice(0, 7);
        let litrosMes = 0, gastoMes = 0, kmMes = 0;
        tanques.forEach(t => {
            if (t.data.startsWith(mesAtual)) {
                litrosMes += t.litros; gastoMes += t.valor;
            }
        });

        // Consumo medio km/l: diferenca entre odometros consecutivos / litros do tanque anterior.
        let totalKm = 0, totalLitrosConsumidos = 0, consumoAmostras = 0;
        for (let i = 1; i < tanques.length; i++) {
            const a = tanques[i - 1], b = tanques[i];
            if (a.odometro && b.odometro && b.odometro > a.odometro) {
                totalKm += (b.odometro - a.odometro);
                totalLitrosConsumidos += a.litros;
                consumoAmostras++;
                if (b.data.startsWith(mesAtual)) kmMes += (b.odometro - a.odometro);
            }
        }
        const consumoMedio = totalLitrosConsumidos > 0 ? totalKm / totalLitrosConsumidos : 0;
        const precoMedioLitroMes = litrosMes > 0 ? gastoMes / litrosMes : 0;
        const totalLitros = tanques.reduce((s, t) => s + t.litros, 0);
        const totalGasto = tanques.reduce((s, t) => s + t.valor, 0);
        const precoMedioLitroGeral = totalLitros > 0 ? totalGasto / totalLitros : 0;

        res.json({
            abastecimentos: tanques.length,
            amostras_consumo: consumoAmostras,
            consumo_medio_km_l: Math.round(consumoMedio * 100) / 100,
            preco_medio_litro_mes: Math.round(precoMedioLitroMes * 100) / 100,
            preco_medio_litro_geral: Math.round(precoMedioLitroGeral * 100) / 100,
            litros_mes: Math.round(litrosMes * 100) / 100,
            gasto_mes: Math.round(gastoMes * 100) / 100,
            km_rodados_mes: kmMes,
            ultimo_odometro: tanques.length ? (tanques[tanques.length - 1].odometro || null) : null
        });
    } catch (e) {
        console.error('finance.combustivel:', e);
        res.status(500).json({ error: 'Erro ao calcular estatísticas de combustível.' });
    }
};

// DELETE /api/finance/lancamentos/:id  (só dono pode apagar)
exports.removerLancamento = async (req, res) => {
    try {
        const email = req.user.email;
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id é obrigatório.' });
        const db = admin.firestore();
        const ref = db.collection('finance_lancamentos').doc(id);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Lançamento não encontrado.' });
        if (snap.data().email !== email) return res.status(403).json({ error: 'Você só pode apagar seus próprios lançamentos.' });
        await ref.delete();
        res.json({ ok: true });
    } catch (e) {
        console.error('finance.removerLancamento:', e);
        res.status(500).json({ error: 'Erro ao remover lançamento.' });
    }
};

// GET /api/finance/serie-mensal?meses=6  -> receita/despesa agregadas por mês
exports.serieMensal = async (req, res) => {
    try {
        const email = req.user.email;
        let meses = parseInt(req.query.meses, 10);
        if (isNaN(meses) || meses < 1 || meses > 24) meses = 6;

        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
        const inicioISO = inicio.toISOString().slice(0, 10);

        const db = admin.firestore();
        // Filtra por data em memória pra evitar índice composto email+data.
        const snap = await db.collection('finance_lancamentos')
            .where('email', '==', email)
            .get();

        // Inicializa todos os meses com 0 — preserva os "vazios" no gráfico.
        const buckets = {};
        for (let i = meses - 1; i >= 0; i--) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            buckets[key] = { mes: key, receita: 0, despesa: 0 };
        }

        snap.forEach(function (d) {
            const x = d.data();
            const dataDoc = String(x.data || '');
            if (dataDoc < inicioISO) return; // filtro de janela em memória
            const key = dataDoc.slice(0, 7); // YYYY-MM
            if (!buckets[key]) return;
            if (x.tipo === 'receita') buckets[key].receita += x.valor;
            else if (x.tipo === 'despesa') buckets[key].despesa += x.valor;
        });

        const serie = Object.values(buckets);
        res.json({ ok: true, serie: serie });
    } catch (e) {
        console.error('finance.serieMensal:', e);
        res.status(500).json({ error: 'Erro ao calcular série mensal.' });
    }
};

// GET /api/finance/categorias-mes  -> gasto por categoria no mês corrente
exports.categoriasMes = async (req, res) => {
    try {
        const email = req.user.email;
        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

        const db = admin.firestore();
        // Mesma estratégia do resumo: filtra em memória pra evitar índice composto.
        const snap = await db.collection('finance_lancamentos')
            .where('email', '==', email)
            .get();

        const totaisMap = {};
        snap.forEach(function (d) {
            const x = d.data();
            if (x.tipo !== 'despesa') return;
            const dataDoc = String(x.data || '');
            if (dataDoc < inicio || dataDoc > fim) return;
            const c = x.categoria || 'Outros';
            totaisMap[c] = (totaisMap[c] || 0) + x.valor;
        });

        const itens = Object.entries(totaisMap)
            .map(([categoria, total]) => ({ categoria, total }))
            .sort((a, b) => b.total - a.total);

        res.json({ ok: true, categorias: itens });
    } catch (e) {
        console.error('finance.categoriasMes:', e);
        res.status(500).json({ error: 'Erro ao calcular categorias.' });
    }
};

// GET /api/finance/orcamento  -> orçamento mensal por categoria (do doc do usuário)
// POST /api/finance/orcamento { categoria, limite }
//   limite=0 ou null remove a categoria do orçamento.
// Doc: finance_orcamento/{email} { categorias: { 'Alimentação': 800, ... } }
exports.listarOrcamento = async (req, res) => {
    try {
        const email = req.user.email;
        const db = admin.firestore();
        const snap = await db.collection('finance_orcamento').doc(email).get();
        const categorias = snap.exists ? (snap.data().categorias || {}) : {};
        res.json({ ok: true, orcamento: categorias });
    } catch (e) {
        console.error('finance.listarOrcamento:', e);
        res.status(500).json({ error: 'Erro ao listar orçamento.' });
    }
};

exports.salvarOrcamento = async (req, res) => {
    try {
        const email = req.user.email;
        const categoria = String(req.body.categoria || '').trim().slice(0, 60);
        const limite = sanitizeValor(req.body.limite);
        if (!categoria) return res.status(400).json({ error: 'Categoria é obrigatória.' });

        const db = admin.firestore();
        const ref = db.collection('finance_orcamento').doc(email);
        const snap = await ref.get();
        const cats = snap.exists ? (snap.data().categorias || {}) : {};
        if (limite === null || limite === 0) {
            delete cats[categoria];
        } else {
            cats[categoria] = limite;
        }
        await ref.set({
            email: email,
            categorias: cats,
            atualizado_em: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.json({ ok: true, orcamento: cats });
    } catch (e) {
        console.error('finance.salvarOrcamento:', e);
        res.status(500).json({ error: 'Erro ao salvar orçamento.' });
    }
};

// GET /api/finance/resumo  -> KPIs do mês corrente
exports.resumo = async (req, res) => {
    try {
        const email = req.user.email;
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

        const db = admin.firestore();
        // Fetch único por email (sem range query — evita exigir índice composto).
        // Range em `data` + equality em `email` exigiria índice; pra poucos lançamentos
        // por usuário o filtro em memória sai mais barato.
        const snapTotal = await db.collection('finance_lancamentos')
            .where('email', '==', email)
            .get();

        let receitaMes = 0, despesaMes = 0, qtdReceitaMes = 0, qtdDespesaMes = 0;
        let saldo = 0;
        snapTotal.forEach(function (d) {
            const x = d.data();
            const dataDoc = String(x.data || '');
            const noMes = dataDoc >= inicioMes && dataDoc <= fimMes;
            if (x.tipo === 'receita') {
                saldo += x.valor;
                if (noMes) { receitaMes += x.valor; qtdReceitaMes++; }
            } else if (x.tipo === 'despesa') {
                saldo -= x.valor;
                if (noMes) { despesaMes += x.valor; qtdDespesaMes++; }
            }
        });

        const taxaPoupanca = receitaMes > 0 ? ((receitaMes - despesaMes) / receitaMes) * 100 : 0;

        res.json({
            ok: true,
            saldo: saldo,
            receita_mes: receitaMes,
            despesa_mes: despesaMes,
            qtd_receita_mes: qtdReceitaMes,
            qtd_despesa_mes: qtdDespesaMes,
            taxa_poupanca: taxaPoupanca,
            categorias_default: CATEGORIAS_DEFAULT,
            mes_referencia: inicioMes.slice(0, 7)
        });
    } catch (e) {
        console.error('finance.resumo:', e);
        res.status(500).json({ error: 'Erro ao calcular resumo.' });
    }
};
