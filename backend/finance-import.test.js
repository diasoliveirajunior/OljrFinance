// Todos os exemplos são fictícios. Estes testes não conectam a serviços reais.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preview, date, money, validateRows } = require('./finance-import');
const category = () => 'Outros';
const file = (nome, content) => ({ nome, arquivo: Buffer.from(content).toString('base64') });

test('datas inexistentes e valores ambíguos nunca viram lançamentos válidos', () => {
    assert.equal(date('31/02/2026'), '');
    assert.equal(date('29/02/2024'), '2024-02-29');
    assert.equal(date('18/11'), '');
    assert.equal(money('1.234'), null);
    assert.equal(money('R$ 1.234,56'), 1234.56);
    assert.equal(money('12,34 D'), -12.34);
    assert.equal(money(''), null);
    assert.throws(() => validateRows([{ data: '2026-02-31', sourceId: '1', descricao: 'Fictício', tipo: 'despesa', valor: '10.00' }]));
});

test('OFX SGML usa o sinal de XFER, preserva FITID e aponta datas inválidas', async () => {
    const content = '<OFX><BANKTRANLIST>' +
      '<STMTTRN><TRNTYPE>XFER\n<DTPOSTED>20261118\n<TRNAMT>12.34\n<FITID>ficticio1\n<MEMO>Exemplo\n</STMTTRN>' +
      '<STMTTRN><TRNTYPE>DEBIT\n<DTPOSTED>20260231\n<TRNAMT>-2.00\n<FITID>ficticio2\n<MEMO>Exemplo\n</STMTTRN></BANKTRANLIST></OFX>';
    const result = await preview(file('exemplo.ofx', content), category);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].tipo, 'receita');
    assert.equal(result.rows[0].sourceId, 'ficticio1');
    assert.equal(result.rows[1].data, '');
});

test('CSV suporta aspas, vírgula decimal, linhas incompletas e IDs estáveis', async () => {
    const payload = file('exemplo.csv', 'Data;Descrição;Valor;Tipo\n18/11/2026;"Exemplo; um";-12,34;\n18/11/2026;Exemplo dois;20,00;\n18/11/2026;Exemplo dois;20,00;\n31/02/2026;Data inválida;2,00;entrada');
    const result = await preview(payload, category);
    assert.equal(result.rows[0].descricao, 'Exemplo; um');
    assert.equal(result.rows[0].tipo, 'despesa');
    assert.equal(result.rows[1].tipo, 'receita'); // coluna de valores assinados reconhecida pelo negativo
    assert.notEqual(result.rows[1].sourceId, result.rows[2].sourceId);
    assert.deepEqual((await preview(payload, category)).rows, result.rows);
    assert.equal(result.rows[3].data, '');
    await assert.rejects(preview({ ...payload, colunas: { data: 0, descricao: 0, valor: 2 } }, category), /colunas diferentes/);
});

test('XLSX permite escolher aba e títulos; não executa fórmulas', async () => {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Capa').addRow(['Exemplo fictício']);
    const sheet = workbook.addWorksheet('Movimentações');
    sheet.addRow(['Relatório fictício']);
    sheet.addRow(['Data', 'Histórico', 'Valor', 'Tipo']);
    sheet.addRow([new Date('2026-11-18T00:00:00Z'), 'Exemplo', 10.25, 'entrada']);
    sheet.addRow([new Date('2026-11-18T00:00:00Z'), 'Fórmula', { formula: '1+1', result: 2 }, 'entrada']);
    const buffer = await workbook.xlsx.writeBuffer();
    const payload = file('exemplo.xlsx', buffer);
    const result = await preview({ ...payload, aba: 1 }, category);
    assert.equal(result.cabecalho, 1);
    assert.equal(result.rows[0].data, '2026-11-18');
    assert.equal(result.rows[0].valor, '10.25');
    assert.equal(result.rows[1].valor, '');
    assert.equal(result.abas.length, 2);
});

// PDF mínimo com texto real em uma página. Sem anexos, imagens ou dados pessoais.
function pdfFixture(text) {
    const stream = `BT /F1 12 Tf 40 750 Td (${text}) Tj ET`;
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
    let content = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((object, i) => { offsets.push(Buffer.byteLength(content)); content += `${i + 1} 0 obj\n${object}\nendobj\n`; });
    const start = Buffer.byteLength(content);
    content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
    return Buffer.from(content);
}

test('PDF com texto oferece prévia; formato ambíguo ou escaneado é recusado', async () => {
    const result = await preview(file('exemplo.pdf', pdfFixture('18/11/2026 Exemplo ficticio -12,34')), category);
    assert.equal(result.rows[0].valor, '12.34');
    assert.equal(result.rows[0].tipo, 'despesa');
    await assert.rejects(preview(file('exemplo.pdf', pdfFixture('18/11/2026 Exemplo 12,34 500,00')), category), /identificar/);
    await assert.rejects(preview(file('exemplo.pdf', pdfFixture('')), category), /escaneado/);
});

test('limites e extensões são verificados antes da leitura', async () => {
    await assert.rejects(preview(file('exemplo.xls', 'fictício'), category), /xlsx/);
    await assert.rejects(preview(file('exemplo.csv', Buffer.alloc(3 * 1024 * 1024 + 1)), category), /3 MB/);
    await assert.rejects(preview(file('exemplo.pdf', 'não é PDF'), category), /PDF inválido/);
});

test('saldo anterior e final não viram lançamentos; entradas e saídas são reconhecidas', async () => {
    const payload = file('ficticio.csv', 'Data;Descrição;Entrada;Saída;Saldo\n18/11/2026;Saldo anterior;;;100,00\n18/11/2026;Recebimento fictício;20,00;;120,00\n18/11/2026;Compra fictícia;;5,00;115,00\n18/11/2026;Saldo final;;;115,00');
    const result = await preview(payload, category);
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows.map(r => r.tipo), ['receita', 'despesa']);
    assert.equal(result.saldos.length, 2);
    assert.equal(result.conferencia.verificadas, 3);
    assert.deepEqual(result.conferencia.linhas_divergentes, []);
});

test('saldos sequenciais resolvem valores positivos; divergências continuam visíveis', async () => {
    const payload = file('ficticio.csv', 'Data;Descrição;Valor;Saldo\n18/11/2026;Saldo anterior;100,00;100,00\n18/11/2026;Compra fictícia;5,00;95,00\n18/11/2026;Outro fictício;10,00;200,00');
    const result = await preview(payload, category);
    assert.equal(result.rows[0].tipo, 'despesa');
    assert.equal(result.rows[1].tipo, '');
    assert.equal(result.conferencia.linhas_divergentes.length, 1);
});

test('duas colunas monetárias preenchidas e escolha de saldo como valor não são aceitas automaticamente', async () => {
    const payload = file('ficticio.csv', 'Data;Descrição;Entrada;Saída;Saldo\n18/11/2026;Movimento fictício;10,00;5,00;100,00');
    const result = await preview(payload, category);
    assert.equal(result.rows[0].tipo, '');
    assert.equal(result.rows[0].valor, '');
    await assert.rejects(preview({ ...payload, colunas: { data: 0, descricao: 1, valor: 4, saldo: 4, entrada: -1, saida: -1 } }, category), /colunas diferentes/);
});

test('a convenção escolhida resolve cartões; positivo sozinho permanece para revisão', async () => {
    const payload = file('ficticio.csv', 'Data;Descrição;Valor\n18/11/2026;Compra fictícia;10,00');
    assert.equal((await preview(payload, category)).rows[0].tipo, '');
    assert.equal((await preview({ ...payload, convencao: 'positivo_saida' }, category)).rows[0].tipo, 'despesa');
    assert.equal((await preview({ ...payload, convencao: 'positivo_entrada' }, category)).rows[0].tipo, 'receita');
});

test('identificador de planilha já importada permanece compatível com a primeira versão', async () => {
    const raw = { data: '18/11/2026', descricao: 'Fictício', valor: '-10,00', tipo: '', categoria: '' };
    const expected = require('./finance-import').hash(JSON.stringify(raw)) + ':1';
    const result = await preview(file('ficticio.csv', 'Data;Descrição;Valor\n18/11/2026;Fictício;-10,00'), category);
    assert.equal(result.rows[0].sourceId, expected);
});

test('saldo de fechamento OFX fica separado das movimentações', async () => {
    const content = '<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT\n<DTPOSTED>20261118\n<TRNAMT>-1.00\n<FITID>ficticio\n<MEMO>Exemplo\n</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>99.00\n<DTASOF>20261118\n</LEDGERBAL></STMTRS></OFX>';
    const result = await preview(file('exemplo.ofx', content), category);
    assert.equal(result.rows.length, 1);
    assert.equal(result.saldos[0].valor, 99);
});
test('extrato do mais recente para o mais antigo mantém direção e ordem visual corretas', async () => {
    const result = await preview(file('ficticio.csv', 'Data;Descrição;Valor;Saldo\n19/11/2026;Compra fictícia;5,00;115,00\n18/11/2026;Entrada fictícia;20,00;120,00\n17/11/2026;Saldo anterior;100,00;100,00'), category);
    assert.deepEqual(result.rows.map(r => r.tipo), ['despesa', 'receita']);
    assert.equal(result.rows[0].descricao, 'Compra fictícia');
    assert.deepEqual(result.conferencia.linhas_divergentes, []);
});
test('saldos do mesmo dia sem ordem definida não inventam direção', async () => {
    const result = await preview(file('ficticio.csv', 'Data;Descrição;Valor;Saldo\n18/11/2026;Primeiro fictício;5,00;100,00\n18/11/2026;Segundo fictício;5,00;95,00'), category);
    assert.deepEqual(result.rows.map(r => r.tipo), ['', '']);
    assert.equal(result.conferencia.verificadas, 0);
});
test('títulos bancários com moeda reconhecem crédito e débito separados', async () => {
    const result = await preview(file('ficticio.csv', 'Data;Histórico;Crédito (R$);Débito (R$);Saldo (R$)\n18/11/2026;Entrada fictícia;10,00;;100,00\n18/11/2026;Saída fictícia;;5,00;95,00'), category);
    assert.deepEqual(result.rows.map(r => r.tipo), ['receita', 'despesa']);
});

module.exports = { pdfFixture };
