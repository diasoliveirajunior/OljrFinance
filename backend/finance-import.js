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
    data: ['data', 'date', 'data lancamento', 'data da transacao', 'data de lancamento'],
    descricao: ['descricao', 'historico', 'description', 'lancamento', 'estabelecimento'],
    valor: ['valor', 'amount', 'valor r$', 'valor da transacao'],
    tipo: ['tipo', 'type', 'natureza', 'entrada/saida'], categoria: ['categoria', 'category'],
};

function tablePreview(tables, options, category) {
    const index = Number(options.aba ?? 0);
    const table = tables[index];
    if (!table) throw new Error('Escolha uma aba válida.');
    let header = Number(options.cabecalho ?? -1);
    if (header < 0) header = table.rows.findIndex(cells => cells.some(c => aliases.data.includes(normalize(c))));
    if (header < 0) header = 0;
    if (!Number.isInteger(header) || header < 0 || header >= table.rows.length) throw new Error('Linha de cabeçalho inválida.');
    const columns = table.rows[header].map((c, i) => clean(c).slice(0, 100) || `Coluna ${i + 1}`);
    const mapping = options.colunas || Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, columns.findIndex(c => names.includes(normalize(c)))]));
    const required = ['data', 'descricao', 'valor'];
    const validColumn = value => Number.isInteger(value) && value >= 0 && value < columns.length;
    if (options.colunas && (!required.every(k => validColumn(mapping[k])) || new Set(required.map(k => mapping[k])).size !== 3)) {
        throw new Error('Escolha colunas diferentes para data, descrição e valor.');
    }
    const body = table.rows.slice(header + 1).filter(cells => cells.some(c => clean(c)));
    if (body.length > MAX_ROWS) throw new Error('Divida a planilha em arquivos com até 1.000 lançamentos.');
    const occurrences = new Map();
    const rows = required.every(k => validColumn(mapping[k])) ? body.map(cells => {
        const raw = Object.fromEntries(Object.keys(aliases).map(key => [key, cells[mapping[key]] ?? '']));
        const base = hash(JSON.stringify(raw));
        const count = (occurrences.get(base) || 0) + 1; occurrences.set(base, count);
        return row(raw, `${base}:${count}`, category);
    }) : [];
    return { rows, abas: tables.map(t => t.name), aba: index, cabecalho: header, colunas: columns, mapeamento: mapping,
        avisos: ['Confira as colunas e o tipo de cada lançamento. Valores positivos sem tipo precisam de indicação de entrada ou saída.'],
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
    return { rows, avisos: [] };
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
