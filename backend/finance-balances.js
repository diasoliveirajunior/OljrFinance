// Saldos informados são posições datadas, nunca movimentos de receita/despesa.
const { hash, date, validateRows } = require('./finance-import');
const cents = value => Math.round(Number(value || 0) * 100);
const brDay = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const identity = (format, id) => hash(JSON.stringify([format, id]));
const fingerprint = r => hash(JSON.stringify([r.data, cents(r.valor), r.tipo]));
const net = rows => rows.reduce((sum, r) => sum + (r.tipo === 'receita' ? cents(r.valor) : -cents(r.valor)), 0);

function statement(preview) {
    const rows = [];
    for (const r of preview.rows) { try { rows.push(validateRows([r])[0]); } catch { /* Explicitamente incompleto. */ } }
    const balances = (preview.saldos || []).filter(s => date(s.data) && typeof s.valor === 'number' && Number.isFinite(s.valor))
        .map(s => ({ data: s.data, centavos: cents(s.valor), tipo: s.tipo || (/anterior|inicial/i.test(s.descricao) ? 'abertura' : 'posicao') }));
    if (balances.length > 1000 || rows.length > 1000) throw new Error('Arquivo muito extenso para conferir saldos.');
    return { saldos: balances, moeda: preview.moeda || 'BRL',
        movimentos: rows.map(r => ({ id: identity(preview.formato, r.sourceId), assinatura: fingerprint(r) })),
        liquido_centavos: net(rows), primeiro_movimento: rows.map(r => r.data).sort()[0] || null,
        ultimo_movimento: rows.map(r => r.data).sort().at(-1) || null,
        leitura_completa: rows.length === preview.rows.length && !preview.automaticIssues && !preview.conferencia?.linhas_divergentes?.length };
}

function calculate(account, movements, statements, today = brDay(new Date())) {
    const ledger = movements.filter(r => date(r.data) && ['receita', 'despesa'].includes(r.tipo) && Number.isFinite(Number(r.valor)));
    const rows = ledger.filter(r => r.data <= today);
    const byId = new Map();
    for (const r of ledger) {
        const source = r.import_source_id || (r.origem === 'ofx' ? r.ofx_fitid : null);
        if (source) byId.set(identity(r.origem, source), fingerprint(r));
    }
    const registered = cents(account.saldo_inicial), issues = [], add = (codigo, texto, extra = {}) => {
        if (issues.length < 100) issues.push({ codigo, texto, ...extra });
    };
    const refs = [];
    let incomplete = 0;
    for (const s of statements) {
        if (!s.leitura_completa || s.estado !== 'concluido') incomplete++;
        if (s.moeda !== 'BRL') { incomplete++; add('moeda', 'Há um extrato em moeda diferente de BRL.'); continue; }
        if ((s.saldos || []).some(b => date(b.data) && b.data > today)) { incomplete++; add('data_futura', 'Há saldo com data futura; ele não foi usado como posição atual.'); }
        const balances = (s.saldos || []).filter(b => date(b.data) && b.data <= today && Number.isSafeInteger(b.centavos));
        refs.push(...balances);
        const opening = balances.filter(b => b.tipo === 'abertura').sort((a,b) => a.data.localeCompare(b.data))[0];
        const closing = balances.filter(b => b.tipo !== 'abertura').sort((a,b) => a.data.localeCompare(b.data)).at(-1);
        if (closing && s.ultimo_movimento && closing.data < s.ultimo_movimento) { incomplete++; add('sem_fechamento', 'Um extrato não informa saldo após seu último movimento.'); }
        if (opening && closing && (!s.ultimo_movimento || closing.data >= s.ultimo_movimento) && s.leitura_completa && opening.centavos + s.liquido_centavos !== closing.centavos) {
            add('fechamento', 'A abertura e os movimentos de um extrato não chegam ao fechamento informado.', { desde: opening.data, ate: closing.data });
        }
        if ((s.movimentos || []).some(m => byId.get(m.id) !== m.assinatura)) {
            add('movimentos', 'Há movimentos do extrato ausentes ou alterados nos lançamentos.', { desde: s.primeiro_movimento, ate: s.ultimo_movimento });
        }
    }
    if (incomplete) add('leitura', 'Há extratos com leitura incompleta ou pendências.');
    const positions = refs.filter(b => b.tipo !== 'abertura').sort((a,b) => a.data.localeCompare(b.data));
    const latestDate = positions.at(-1)?.data || null;
    const latest = positions.filter(b => b.data === latestDate);
    const conflict = new Set(latest.map(b => b.centavos)).size > 1;
    if (conflict) add('conflito', 'Os extratos informam saldos diferentes para a data mais recente.');
    const firstMovement = rows.map(r => r.data).sort()[0];
    // Abertura só serve de base quando cobre o início do histórico registrado.
    let opening = refs.filter(b => b.tipo === 'abertura' && (!firstMovement || b.data <= firstMovement)).sort((a,b) => a.data.localeCompare(b.data))[0];
    if (opening && new Set(refs.filter(b => b.tipo === 'abertura' && b.data === opening.data).map(b => b.centavos)).size > 1) {
        add('conflito_historico', 'Há valores diferentes para a abertura do histórico.'); opening = null;
    }
    const base = opening?.centavos ?? registered;
    const baselineRows = opening ? rows.filter(r => r.data >= opening.data) : rows;
    if (opening && opening.centavos !== registered) add('base_cadastro', 'O saldo inicial do cadastro difere da abertura do extrato. O cálculo usa a abertura documentada.');
    if (!opening && positions.length) add('sem_abertura', 'Não há abertura documentada para conferir todo o histórico.');
    // Compara o fim de um período com a abertura seguinte, sem inventar movimentos para fechar diferenças.
    const openings = refs.filter(b => b.tipo === 'abertura').sort((a,b) => a.data.localeCompare(b.data));
    const intervals = new Set();
    for (const start of openings) {
        const prior = positions.filter(b => b.data < start.data).at(-1);
        if (!prior) continue;
        const interval = `${prior.data}/${start.data}`;
        if (intervals.has(interval)) continue;
        intervals.add(interval);
        const candidates = positions.filter(b => b.data === prior.data);
        if (new Set(candidates.map(b => b.centavos)).size > 1) { add('conflito_historico', 'Há saldos conflitantes no histórico.', { desde: prior.data, ate: start.data }); continue; }
        const between = rows.filter(r => r.data > prior.data && r.data <= start.data);
        if (prior.centavos + net(between) !== start.centavos) add('continuidade', 'O saldo mudou entre extratos sem movimentos suficientes no histórico para explicar a diferença.', { desde: prior.data, ate: start.data });
    }
    const bankCents = latest.length && !conflict ? latest[0].centavos : null;
    const atBank = latestDate ? base + net(baselineRows.filter(r => r.data <= latestDate)) : null;
    const diff = bankCents === null ? null : atBank - bankCents;
    if (diff !== null && diff !== 0) add('diferenca', 'O saldo calculado não coincide com o último saldo informado pelo extrato.');
    const calculated = base + net(baselineRows);
    const after = latestDate ? rows.filter(r => r.data > latestDate) : [];
    if (after.length) { incomplete++; add('apos_extrato', 'Há lançamentos posteriores ao último saldo informado, ainda não conferidos por novo extrato.'); }
    const covered = new Set(statements.flatMap(s => (s.movimentos || []).map(m => m.id)));
    if (latestDate && rows.some(r => r.data <= latestDate && !covered.has(identity(r.origem, r.import_source_id || r.ofx_fitid)))) {
        incomplete++; add('sem_origem', 'Há lançamentos sem correspondência nos extratos documentados.');
    }
    const status = conflict ? 'conflito' : !positions.length ? 'sem_extrato' :
        issues.some(i => ['fechamento','movimentos','continuidade','diferenca','conflito_historico'].includes(i.codigo)) ? 'divergente' :
        incomplete || !opening ? 'incompleto' : 'conferido';
    return {
        saldo_atual: conflict ? null : bankCents === null ? calculated / 100 : bankCents / 100,
        saldo_informado: bankCents === null ? null : bankCents / 100, data_saldo_informado: latestDate,
        saldo_calculado: calculated / 100, saldo_calculado_cadastro: (registered + net(rows)) / 100,
        saldo_calculado_na_data: atBank === null ? null : atBank / 100,
        saldo_estimado: bankCents === null ? null : (bankCents + net(after)) / 100,
        movimentos_posteriores: after.length, movimentos_futuros: movements.filter(r => r.data > today).length,
        base_calculo: { origem: opening ? 'abertura_extrato' : 'cadastro', data: opening?.data || null, valor: base / 100,
            entradas: baselineRows.filter(r => r.tipo === 'receita').reduce((s,r) => s+cents(r.valor),0)/100,
            saidas: baselineRows.filter(r => r.tipo === 'despesa').reduce((s,r) => s+cents(r.valor),0)/100 },
        conciliacao: { status, diferenca: diff === null ? null : diff / 100, avisos: issues, extratos: statements.length },
    };
}

async function load(db, email) {
    const [accounts, movements, statements] = await Promise.all([
        db.collection('finance_contas').where('email','==',email).get(),
        db.collection('finance_lancamentos').where('email','==',email).get(),
        db.collection('finance_extratos').where('email','==',email).get(),
    ]);
    return accounts.docs.map(doc => ({ id: doc.id, data: doc.data(),
        balance: calculate(doc.data(), movements.docs.map(d => d.data()).filter(r => r.conta_id === doc.id),
            statements.docs.map(d => d.data()).filter(s => s.conta_id === doc.id && !s.cartao_id && s.email === email)) }));
}
module.exports = { statement, calculate, load, brDay, identity, fingerprint };
