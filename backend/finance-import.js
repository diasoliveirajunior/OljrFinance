// Leitura local ao servidor. Arquivos e conteúdo financeiro não são persistidos nem enviados a terceiros.
const crypto = require('node:crypto');
const MAX_ROWS = 1000;
const MAX_BYTES = 3 * 1024 * 1024;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => String(value ?? '').trim();
const normalize = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function decode(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { return new TextDecoder('windows-1252').decode(buffer); }
}

function date(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
    const text = clean(value);
    let parts = /^(\d{4})-?(\d{2})-?(\d{2})(?:$|T|\d)/.exec(text);
    if (!parts) {
        const br = /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(text);
        if (br) parts = [br[0], br[3], br[2], br[1]];
    }
    if (!parts) return '';
    const iso = `${parts[1]}-${parts[2]}-${parts[3]}`;
    const parsed = new Date(`${iso}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : '';
}

function money(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    let text = clean(value).replace(/R\$|\s/g, '');
    if (!text) return null;
    const negative = /^\(.*\)$/.test(text) || /(?:D|-)$/i.test(text);
    text = text.replace(/[CD]$/i, '').replace(/-$/, '').replace(/[()]/g, '');
    if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    // Reject ambiguous thousands-only text instead of silently reading 1.234 as 1.23.
    if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const result = Number(text);
    return Number.isFinite(result) ? (negative ? -Math.abs(result) : result) : null;
}

function type(value) {
    const text = normalize(value);
    if (['receita', 'credito', 'credit', 'entrada', 'c', 'credit', 'dep', 'int', 'div'].includes(text)) return 'receita';
    if (['despesa', 'debito', 'debit', 'saida', 'd', 'pos', 'check', 'payment', 'atm', 'cash'].includes(text)) return 'despesa';
    return '';
}

function row(raw, sourceId, category) {
    const amount = money(raw.valor);
    const direction = type(raw.tipo) || (amount !== null && amount < 0 ? 'despesa' : '');
    return {
        sourceId, data: date(raw.data), descricao: clean(raw.descricao).slice(0, 200),
        valor: amount === null ? '' : Math.abs(amount).toFixed(2), tipo: direction,
        categoria: clean(raw.categoria).slice(0, 60) || category(clean(raw.descricao)),
    };
}

function csv(content) {
    const text = content.replace(/^\uFEFF/, '');
    const line = text.split(/\r?\n/)[0];
    const delimiter = [';', '\t', ','].sort((a, b) => line.split(b).length - line.split(a).length)[0];
    const rows = []; let cells = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
            else quoted = !quoted;
        } else if (!quoted && (c === delimiter || c === '\n')) {
            cells.push(cell.replace(/\r$/, '')); cell = '';
            if (c === '\n') { rows.push(cells); cells = []; }
        } else cell += c;
        if (rows.length > MAX_ROWS + 100) throw new Error('Arquivo muito extenso. Divida em arquivos com até 1.000 lançamentos.');
    }
    if (quoted) throw new Error('CSV com aspas não fechadas. Confira o arquivo.');
    if (cell || cells.length) rows.push([...cells, cell]);
    return rows;
}

const aliases = {
    data: ['data', 'date', 'data lancamento', 'data da transacao', 'data de lancamento', 'data movimento', 'dt movimento'],
    descricao: ['descricao', 'historico', 'description', 'lancamento', 'estabelecimento'],
    valor: ['valor', 'amount', 'valor r$', 'valor da transacao'],
    tipo: ['tipo', 'type', 'natureza', 'entrada/saida', 'credito/debito', 'debito/credito', 'c/d', 'd/c', 'tipo lancamento'], categoria: ['categoria', 'category'],
    entrada: ['entrada', 'entradas', 'credito', 'creditos', 'valor credito', 'recebimentos'],
    saida: ['saida', 'saidas', 'debito', 'debitos', 'valor debito', 'pagamentos'],
    saldo: ['saldo', 'saldo r$', 'saldo atual', 'saldo apos lancamento'],
};
const headerKey = value => normalize(value).replace(/r\$/g, '').replace(/[^a-z0-9]/g, '');
function balanceLabel(value) {
    return /^(saldo(?:\s|$)|total(?:\s+(?:(?:de|das|dos)\s+)?(?:entradas|saidas|creditos|debitos|receitas|despesas|geral|do dia)|$))/.test(normalize(value));
}

function tablePreview(tables, options, category) {
    const index = Number(options.aba ?? 0);
    const table = tables[index];
    if (!table) throw new Error('Escolha uma aba válida.');
    let header = Number(options.cabecalho ?? -1);
    if (header < 0) header = table.rows.findIndex(cells => cells.some(c => aliases.data.some(name => headerKey(name) === headerKey(c))));
    if (header < 0) header = 0;
    if (!Number.isInteger(header) || header < 0 || header >= table.rows.length) throw new Error('Linha de cabeçalho inválida.');
    const columns = table.rows[header].map((c, i) => clean(c).slice(0, 100) || `Coluna ${i + 1}`);
    const mapping = { ...Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, columns.findIndex(c => names.some(name => headerKey(name) === headerKey(c)))])), ...options.colunas };
    const required = ['data', 'descricao'];
    const validColumn = value => Number.isInteger(value) && value >= 0 && value < columns.length;
    const hasValue = validColumn(mapping.valor);
    const hasFlows = validColumn(mapping.entrada) || validColumn(mapping.saida);
    const ready = required.every(k => validColumn(mapping[k])) && (hasValue || hasFlows);
    const chosen = Object.values(mapping).filter(validColumn);
    if (options.colunas && (!ready || new Set(chosen).size !== chosen.length)) {
        throw new Error('Escolha colunas diferentes para data, descrição, valor ou entrada/saída e saldo.');
    }
    const body = table.rows.slice(header + 1).filter(cells => cells.some(c => clean(c)));
    if (body.length > MAX_ROWS) throw new Error('Divida a planilha em arquivos com até 1.000 lançamentos.');
    const occurrences = new Map();
    const rows = [], saldos = [], divergencias = [];
    let previousBalance = null, checked = 0;
    const signedValues = hasValue && body.some(cells => !balanceLabel(cells[mapping.descricao]) && !balanceLabel(cells[mapping.tipo]) && (money(cells[mapping.valor]) ?? 0) < 0);
    const entries = ready ? body.map((cells, index) => {
        const raw = Object.fromEntries(Object.keys(aliases).map(key => [key, cells[mapping[key]] ?? '']));
        // Mantém os identificadores da primeira versão para não duplicar arquivos já importados.
        const original = Object.fromEntries(['data', 'descricao', 'valor', 'tipo', 'categoria'].map(key => [key, raw[key]]));
        if (!hasValue) Object.assign(original, { entrada: raw.entrada, saida: raw.saida });
        const base = hash(JSON.stringify(original));
        const count = (occurrences.get(base) || 0) + 1; occurrences.set(base, count);
        return { raw, index, sourceId: `${base}:${count}` };
    }) : [];
    const dates = entries.filter(e => !balanceLabel(e.raw.descricao)).map(e => date(e.raw.data)).filter(Boolean);
    let ascending = false, descending = false;
    dates.forEach((value, i) => { if (i) { if (value > dates[i - 1]) ascending = true; if (value < dates[i - 1]) descending = true; } });
    const opening = entries.findIndex(e => /^saldo\s+(anterior|inicial)\b/.test(normalize(e.raw.descricao)));
    const reverse = descending && !ascending || !ascending && !descending && opening > 0 && opening === entries.length - 1;
    const sequential = !(ascending && descending) && (ascending || descending || opening === 0 || opening > 0 && opening === entries.length - 1);
    const iteration = reverse ? [...entries].reverse() : entries;
    iteration.forEach(({ raw, index, sourceId }) => {
        const balance = validColumn(mapping.saldo) ? money(raw.saldo) : null;
        if (balanceLabel(raw.descricao) || balanceLabel(raw.tipo)) {
            // Um saldo é posição da conta. Um total é apenas resumo; nenhum vira movimentação.
            if (/^saldo(?:\s|$)/.test(normalize(raw.descricao)) || /^saldo(?:\s|$)/.test(normalize(raw.tipo))) {
                const value = balance ?? (hasValue ? money(raw.valor) : null);
                saldos.push({ data: date(raw.data), descricao: clean(raw.descricao), valor: value });
                if (value !== null) {
                    const cents = Math.round(value * 100);
                    if (sequential && previousBalance !== null && /final|atual|do dia/.test(normalize(raw.descricao))) {
                        checked++; if (previousBalance !== cents) divergencias.push(index + header + 2);
                    }
                    previousBalance = cents;
                }
            }
            return;
        }
        const explicit = type(raw.tipo);
        let amount = hasValue ? money(raw.valor) : null;
        let direction = explicit, explanation = explicit ? 'Tipo informado no arquivo' : '';
        if (hasFlows) {
            const incoming = money(raw.entrada), outgoing = money(raw.saida);
            const inEmpty = !clean(raw.entrada) || incoming === 0, outEmpty = !clean(raw.saida) || outgoing === 0;
            if (incoming !== null && incoming > 0 && outEmpty) { amount = incoming; direction = 'receita'; explanation = 'Coluna de entrada'; }
            else if (outgoing !== null && outgoing !== 0 && inEmpty) { amount = Math.abs(outgoing); direction = 'despesa'; explanation = 'Coluna de saída'; }
            else { amount = null; direction = ''; explanation = 'Confira as colunas de entrada e saída'; }
            if (explicit && direction && explicit !== direction) { direction = ''; explanation = 'Tipo e coluna de valor divergentes'; }
        } else if (!explicit && amount !== null) {
            const delta = sequential && previousBalance !== null && balance !== null ? Math.round(balance * 100) - previousBalance : null;
            if (delta !== null && Math.abs(delta) === Math.round(Math.abs(amount) * 100) && delta !== 0) {
                direction = delta > 0 ? 'receita' : 'despesa'; explanation = 'Conferido pela sequência de saldos';
            } else if (options.convencao === 'positivo_saida') {
                direction = amount > 0 ? 'despesa' : 'receita'; explanation = 'Convenção de sinais escolhida';
            } else if (options.convencao === 'positivo_entrada' || amount < 0 || signedValues || /^[+]/.test(clean(raw.valor)) || /[CD]$/i.test(clean(raw.valor))) {
                direction = amount < 0 ? 'despesa' : 'receita'; explanation = 'Sinal ou código do valor';
            }
        }
        const parsed = row({ ...raw, valor: amount, tipo: direction }, sourceId, category);
        // row() tem fallback pelo sinal; conflitos devem continuar pendentes de revisão.
        parsed.tipo = direction;
        parsed.identificado_por = explanation;
        parsed.saldo_apos = balance;
        rows.push({ ...parsed, _order: index });
        const amountCents = amount === null ? null : Math.round(Math.abs(amount) * 100);
        if (sequential && previousBalance !== null && balance !== null && amountCents !== null && !direction) {
            checked++; divergencias.push(index + header + 2);
        }
        if (sequential && previousBalance !== null && amountCents !== null && direction && parsed.data) {
            const expected = previousBalance + (direction === 'receita' ? amountCents : -amountCents);
            if (balance !== null) {
                checked++;
                if (expected !== Math.round(balance * 100)) divergencias.push(index + header + 2);
            }
            previousBalance = balance === null ? expected : Math.round(balance * 100);
        } else previousBalance = balance === null ? null : Math.round(balance * 100);
    });
    rows.sort((a, b) => a._order - b._order); rows.forEach(r => { delete r._order; });
    return { rows, abas: tables.map(t => t.name), aba: index, cabecalho: header, colunas: columns, mapeamento: mapping,
        saldos, conferencia: { verificadas: checked, linhas_divergentes: divergencias },
        avisos: [...(rows.some(r => !r.tipo) ? ['Há movimentos sem direção definida. Confira as linhas destacadas ou ajuste a leitura das colunas.'] : []),
            ...(!sequential && validColumn(mapping.saldo) && rows.length > 1 ? ['A ordem cronológica dos saldos não ficou definida. Eles não foram usados para inferir a direção dos movimentos.'] : []),
            ...(divergencias.length ? [`Saldo divergente em ${divergencias.length} linha(s). Compare com o arquivo original antes de confirmar.`] : [])],
        amostra: body.slice(0, 3).map(cells => cells.map(c => clean(c).slice(0, 100))) };
}

function ofx(content, category) {
    const blocks = content.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) || [];
    const rows = blocks.map((block, i) => {
        const get = tag => (block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')) || [])[1]?.trim() || '';
        const amount = money(get('TRNAMT'));
        const raw = { data: get('DTPOSTED'), descricao: [get('MEMO'), get('NAME')].filter(Boolean).join(' - '), valor: get('TRNAMT'),
            tipo: type(get('TRNTYPE')) || (amount === null ? '' : amount < 0 ? 'despesa' : 'receita') };
        return { ...row(raw, get('FITID') || hash(`${i}:${JSON.stringify(raw)}`), category), fitid: get('FITID') || null };
    });
    if (rows.length > MAX_ROWS) throw new Error('Divida o OFX em arquivos com até 1.000 lançamentos.');
    if (!rows.length) throw new Error('Não encontramos lançamentos no OFX.');
    const ledger = content.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>)/i)?.[1];
    const amount = ledger?.match(/<BALAMT>([^<\r\n]+)/i)?.[1];
    const stamp = ledger?.match(/<DTASOF>([^<\r\n]+)/i)?.[1];
    return { rows, saldos: ledger ? [{ data: date(stamp), descricao: 'Saldo informado no OFX', valor: money(amount) }] : [],
        avisos: ledger ? ['O saldo informado no OFX é referência da conta e não gera receita ou despesa.'] : [] };
}

async function pdf(buffer, category) {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, stopAtErrors: true });
    let document;
    try {
        document = await task.promise;
        if (document.numPages > 30) throw new Error('PDF com mais de 30 páginas. Divida o arquivo.');
        const rows = [], ignored = []; let textLength = 0;
        for (let p = 1; p <= document.numPages; p++) {
            const page = await document.getPage(p);
            const content = await page.getTextContent();
            // Agrupa visualmente por coordenada vertical; preserva colunas da esquerda para a direita.
            const lines = [];
            for (const item of content.items) {
                if (!('str' in item) || !item.str.trim()) continue;
                textLength += item.str.length;
                if (textLength > 500000) throw new Error('PDF muito extenso. Divida o arquivo.');
                let line = lines.find(l => Math.abs(l.y - item.transform[5]) < 2);
                if (!line) { line = { y: item.transform[5], items: [] }; lines.push(line); }
                line.items.push({ x: item.transform[4], text: item.str });
            }
            lines.sort((a, b) => b.y - a.y);
            for (const line of lines) {
                const text = line.items.sort((a, b) => a.x - b.x).map(i => i.text).join(' ').trim();
                if (!/^\d{2}[/.]\d{2}(?:[/.]\d{4})?\b|^\d{4}-\d{2}-\d{2}\b/.test(text)) continue;
                const match = /^(\d{2}[/.]\d{2}[/.]\d{4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+(?:R\$\s*)?([+-]?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})(?:\s*([CD]))?$/i.exec(text);
                if (!match || /\bsaldo\b|\btotal\b/i.test(match[2]) || /\d[.,]\d{2}\b/.test(match[2])) { ignored.push(p); continue; }
                rows.push(row({ data: match[1], descricao: match[2], valor: match[3], tipo: match[4] || (match[3].startsWith('+') ? 'receita' : '') }, hash(`${p}:${text}:${rows.length}`), category));
                if (rows.length > MAX_ROWS) throw new Error('PDF com mais de 1.000 lançamentos. Divida o arquivo.');
            }
        }
        if (!textLength) throw new Error('PDF sem texto selecionável (escaneado). Exporte OFX, Excel ou CSV do banco.');
        if (!rows.length) throw new Error('Não foi possível identificar os lançamentos com segurança neste PDF. Prefira OFX, Excel ou CSV. Datas precisam incluir o ano e cada linha deve ter um único valor.');
        return { rows, avisos: ['A leitura de PDF depende do formato do banco. Compare os lançamentos e totais com o documento original antes de confirmar.',
            ...(ignored.length ? [`${ignored.length} linha(s) com data não foram convertidas (incluindo saldos, totais ou colunas ambíguas). Confira o PDF original.`] : [])] };
    } finally { await task.destroy(); }
}

async function preview(body, category) {
    const name = clean(body.nome);
    const extension = name.split('.').pop().toLowerCase();
    if (!['ofx', 'xlsx', 'csv', 'pdf'].includes(extension)) throw new Error('Use OFX, Excel (.xlsx), CSV ou PDF. Para .xls, salve uma cópia como .xlsx.');
    if (typeof body.arquivo !== 'string' || body.arquivo.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.arquivo)) throw new Error('Arquivo inválido ou maior que 3 MB.');
    const buffer = Buffer.from(body.arquivo, 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Escolha um arquivo de até 3 MB.');
    let result;
    if (extension === 'ofx') result = ofx(decode(buffer), category);
    if (extension === 'csv') result = tablePreview([{ name: 'CSV', rows: csv(decode(buffer)) }], body, category);
    if (extension === 'pdf') {
        if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Arquivo PDF inválido.');
        result = await pdf(buffer, category);
    }
    if (extension === 'xlsx') {
        if (buffer.readUInt16LE(0) !== 0x4b50) throw new Error('Planilha inválida. Salve como Excel .xlsx.');
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        if (workbook.worksheets.length > 20) throw new Error('Planilha com muitas abas. Envie apenas a aba dos lançamentos.');
        const tables = workbook.worksheets.map(sheet => {
            if (sheet.rowCount > MAX_ROWS + 100 || sheet.columnCount > 100) throw new Error('Planilha muito extensa. Use até 1.000 lançamentos e 100 colunas.');
            const rows = [];
            sheet.eachRow({ includeEmpty: true }, r => {
                const cells = [];
                for (let i = 1; i <= sheet.columnCount; i++) {
                    const c = r.getCell(i); const v = c.value;
                    // Fórmulas nunca são executadas. Resultados financeiros devem vir como valores.
                    cells.push(v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v) ? '' : v instanceof Date ? date(v) : typeof v === 'number' ? v : c.text);
                }
                rows.push(cells);
            });
            return { name: sheet.name, rows };
        });
        result = tablePreview(tables, body, category);
        result.avisos.push('Células com fórmulas não são importadas. Cole os resultados como valores antes de enviar.');
    }
    return { ...result, formato: extension };
}

function validateRows(rows) {
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) throw new Error('Selecione entre 1 e 1.000 lançamentos.');
    return rows.map((r, i) => {
        if (!r || !date(r.data) || !clean(r.descricao) || clean(r.descricao).length > 200 || !['receita', 'despesa'].includes(r.tipo)) throw new Error(`Confira data, descrição e tipo do lançamento ${i + 1}.`);
        const amount = money(r.valor);
        if (amount === null || amount <= 0 || amount > 999999999.99) throw new Error(`Valor inválido no lançamento ${i + 1}.`);
        if (!clean(r.sourceId) || clean(r.sourceId).length > 256) throw new Error('Identificação de origem inválida. Leia o arquivo novamente.');
        return { sourceId: clean(r.sourceId), data: date(r.data), descricao: clean(r.descricao), tipo: r.tipo,
            valor: Math.round(amount * 100) / 100, categoria: clean(r.categoria).slice(0, 60) || 'Outros', fitid: clean(r.fitid).slice(0, 256) || null };
    });
}

module.exports = { preview, validateRows, hash, date, money, ofx, tablePreview, csv, MAX_ROWS };
