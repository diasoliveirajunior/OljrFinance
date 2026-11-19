const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { preview, hash } = require('./finance-import');
const { createEngine, classify, signature } = require('./finance-drive-sync').internals;
const email = 'teste@invalid.test', uid = 'uid-ficticio';
const row = { sourceId: 'tx-ficticia', fitid: 'tx-ficticia', data: '2026-11-19', descricao: 'Exemplo fictício', valor: '12.50', tipo: 'despesa', categoria: 'Outros' };

function setup() {
    const docs = new Map(); let lock = Promise.resolve(), downloadCount = 0, beforeDownload, beforeSave;
    const snapshot = ref => ({ exists: docs.has(ref.key), id: ref.key.split('/').pop(), data: () => docs.get(ref.key), ref });
    function collection(name, conditions = []) {
        const query = { doc(id) { const ref = { key: `${name}/${id}`, get: async () => snapshot(ref), collection: child => collection(`${ref.key}/${child}`) }; return ref; },
            where(f, op, v) { return collection(name, [...conditions, [f, op, v]]); },
            async get() { const found = [...docs.keys()].filter(k => k.startsWith(name + '/') && k.slice(name.length + 1).indexOf('/') < 0 && conditions.every(([f, op, v]) => op === 'in' ? v.includes(docs.get(k)[f]) : docs.get(k)[f] === v));
                const result = found.map(k => snapshot({ key: k })); return { docs: result, size: result.length, forEach: fn => result.forEach(fn) }; } };
        return query;
    }
    const db = { collection, async runTransaction(fn) {
        const previous = lock; let unlock; lock = new Promise(resolve => { unlock = resolve; }); await previous;
        const writes = [];
        try { const result = await fn({ get: ref => ref.get ? ref.get() : Promise.resolve(snapshot(ref)), getAll: async (...refs) => refs.map(snapshot),
            set: (ref, data) => writes.push(() => docs.set(ref.key, data)), update: (ref, data) => writes.push(() => docs.set(ref.key, { ...docs.get(ref.key), ...data })),
            create: (ref, data) => writes.push(() => { assert.equal(docs.has(ref.key), false); docs.set(ref.key, data); }) });
            writes.forEach(w => w()); return result;
        } finally { unlock(); }
    } };
    const firestore = () => db; firestore.FieldValue = { serverTimestamp: () => 123 };
    const files = Array.from({ length: 2 }, (_, i) => ({ id: `arquivo-ficticio-${i}`, name: `exemplo${i}.ofx`, modifiedTime: 'v1', mimeType: 'text/plain', size: 42 }));
    const drive = { internals: { folderId: id => id, supported: () => true, registryId: (...args) => hash(JSON.stringify(args)) },
        access: async () => ({ drive: { files: { list: async () => ({ data: { files } }) } } }),
        async download(_email, _uid, id) { downloadCount++; if (beforeDownload) await beforeDownload(); return { nome: `${id}.ofx`, arquivo: id, drive: { file_id: id, versao: files.find(f => f.id === id).modifiedTime } }; },
        async validateSource(_email, _uid, source) { return { ...source, revision: docs.get(`finance_storage_connections/${email}__google`).revision, pasta_id: 'pasta-ficticia' }; } };
    const sandbox = { exports: {}, require: name => name === 'firebase-admin' ? { firestore } : name === './finance-google-drive' ? drive : require(name), __dirname, setTimeout, clearTimeout };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'finance-import.controller.js'), 'utf8'), sandbox);
    const importer = { async readPreview(source) { return { formato: 'ofx', rows: [{ ...row, sourceId: source.arquivo, fitid: source.arquivo }] }; },
        async confirmar(req, res) { if (beforeSave) await beforeSave(); await sandbox.exports.confirmar(req, res); } };
    const connectionKey = `finance_storage_connections/${email}__google`;
    docs.set(connectionKey, { email, uid, ativo: true, automacao: true, provider: 'google', revision: 1, pasta_id: 'pasta-ficticia', conta_id: 'conta-ficticia', cartao_id: null });
    docs.set(`usuarios/${email}`, { ativo: true, paineis: ['FINANCE'] });
    docs.set('finance_contas/conta-ficticia', { email });
    const engine = createEngine({ db, drive, importer, identity: async () => ({ email, disabled: false }), schedule: () => {} });
    return { docs, db, engine, importer, drive, files, connectionKey, downloads: () => downloadCount,
        beforeDownload: fn => { beforeDownload = fn; }, beforeSave: fn => { beforeSave = fn; } };
}
const count = s => [...s.docs.keys()].filter(k => k.startsWith('finance_lancamentos/')).length;

test('lê todos os arquivos do lote, lança sem prévia e não repete na próxima execução', async () => {
    const s = setup();
    const result = await s.engine.run(email, uid);
    // A segunda origem idêntica não é assumida como uma nova transação.
    assert.equal(result.importadas, 1); assert.equal(result.pendentes, 1); assert.equal(count(s), 1);
    await s.engine.run(email, uid); assert.equal(s.downloads(), 2); assert.equal(count(s), 1);
});
test('duas instâncias concorrentes só adquirem uma licença de processamento', async () => {
    const s = setup();
    const results = await Promise.all([s.engine.run(email, uid), s.engine.run(email, uid)]);
    assert.equal(results.filter(r => r.ocupado).length, 1); assert.equal(s.downloads(), 2);
});
test('desconexão ou pausa antes da gravação impede todos os movimentos', async () => {
    for (const change of [{ ativo: false }, { automacao: false }, { revision: 2 }, { sync_lease: 'outro' }]) {
        const s = setup(); s.beforeSave(() => Object.assign(s.docs.get(s.connectionKey), change));
        await s.engine.run(email, uid); assert.equal(count(s), 0);
    }
});
test('usuário bloqueado, sem FINANCE ou com UID diferente não processa', async () => {
    for (const user of [{ ativo: false, paineis: ['FINANCE'] }, { ativo: true, paineis: [] }, { ativo: true, paineis: ['FINANCE'], papel: 'convidado', expira_em: '2000-01-01' }]) {
        const s = setup(); s.docs.set(`usuarios/${email}`, user);
        await assert.rejects(s.engine.run(email, uid)); assert.equal(s.downloads(), 0);
    }
    const s = setup(); await s.engine.run(email, 'uid-outra-pessoa'); assert.equal(s.downloads(), 0);
});
test('revogação de acesso durante a leitura e destino de outra pessoa impedem gravação', async () => {
    const s = setup(); s.beforeDownload(() => s.docs.set(`usuarios/${email}`, { ativo: false, paineis: ['FINANCE'] }));
    await s.engine.run(email, uid); assert.equal(count(s), 0);
    const other = setup(); other.docs.set('finance_contas/conta-ficticia', { email: 'outro@invalid.test' });
    await other.engine.run(email, uid); assert.equal(count(other), 0);
});
test('falha parcial de 401 linhas retoma sem perder nem repetir lote concluído', async () => {
    const s = setup(); s.files.splice(1);
    s.importer.readPreview = async () => ({ formato: 'ofx', rows: Array.from({ length: 401 }, (_, i) => ({ ...row, sourceId: `tx-${i}`, fitid: `tx-${i}` })) });
    let attempts = 0;
    s.beforeSave(() => { if (++attempts === 2) throw new Error('Falha fictícia'); });
    await s.engine.run(email, uid); assert.equal(count(s), 400);
    s.beforeSave(null); await s.engine.run(email, uid); assert.equal(count(s), 401);
});
test('divergência, PDF incompleto e IDs repetidos ficam pendentes sem lançamento', () => {
    assert.equal(classify({ rows: [row], conferencia: { linhas_divergentes: [3] } }).valid.length, 0);
    assert.equal(classify({ rows: [row], automaticIssues: true }).valid.length, 0);
    assert.equal(classify({ rows: [row, row] }).valid.length, 0);
    const mixed = classify({ rows: [row, { ...row, sourceId: 'ambigua', tipo: '' }] });
    assert.equal(mixed.valid.length, 1); assert.equal(mixed.pending.length, 1);
});
test('saldo não vira movimento e abas reconhecidas são lidas automaticamente', async () => {
    const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook();
    for (const name of ['Janeiro', 'Fevereiro']) {
        const sheet = wb.addWorksheet(name); sheet.addRows([['Data', 'Descrição', 'Entrada', 'Saída'], ['19/11/2026', 'Saldo anterior', '', 100], ['19/11/2026', `Exemplo ${name}`, '', 12]]);
    }
    const result = await preview({ nome: 'ficticio.xlsx', arquivo: Buffer.from(await wb.xlsx.writeBuffer()).toString('base64'), automatico: true }, () => 'Outros');
    assert.equal(result.rows.length, 2); assert.equal(classify(result).valid.length, 2);
});
test('comparação de repetidos tolera acento, caixa e espaço sem misturar direção', () => {
    assert.equal(signature(row), signature({ ...row, descricao: ' EXEMPLO FICTICIO  ' }));
    assert.notEqual(signature(row), signature({ ...row, tipo: 'receita' }));
});

test('arquivo atualizado com novos movimentos é lido, correção de histórico vira pendência', async () => {
    const s = setup(); s.files.splice(1);
    let rows = [{ ...row, sourceId: 'tx1', fitid: 'tx1' }];
    s.importer.readPreview = async () => ({ formato: 'ofx', rows });
    await s.engine.run(email, uid); assert.equal(count(s), 1);
    rows = [...rows, { ...row, data: '2026-11-20', sourceId: 'tx2', fitid: 'tx2' }];
    s.files[0].modifiedTime = 'v2'; await s.engine.run(email, uid); assert.equal(count(s), 2);
    rows = [{ ...rows[0], valor: '99.00' }, rows[1]];
    s.files[0].modifiedTime = 'v3'; const result = await s.engine.run(email, uid);
    assert.equal(count(s), 2); assert.equal(result.pendentes, 2);
    assert.match(result.arquivos[0].motivo, /alterou ou removeu/);
});

test('paginação percorre o lote seguinte e retoma depois de reiniciar o motor', async () => {
    const s = setup(); const calls = [];
    s.drive.access = async () => ({ drive: { files: { list: async options => {
        calls.push(options.pageToken);
        return { data: { files: [s.files[options.pageToken ? 1 : 0]], nextPageToken: options.pageToken ? null : 'pagina2' } };
    } } } });
    await s.engine.run(email, uid);
    const restarted = createEngine({ db: s.db, drive: s.drive, importer: s.importer, identity: async () => ({ email }), schedule: () => {} });
    await restarted.run(email, uid);
    assert.deepEqual(calls, [undefined, 'pagina2']); assert.equal(s.downloads(), 2);
});

test('licença abandonada expira e permite retomar após queda do servidor', async () => {
 const s = setup(); Object.assign(s.docs.get(s.connectionKey), {sync_lease:'servidor-antigo',sync_lease_until:Date.now()+60000});
 assert.equal((await s.engine.run(email,uid)).ocupado,true); assert.equal(s.downloads(),0);
 s.docs.get(s.connectionKey).sync_lease_until = 1;
 await s.engine.run(email,uid); assert.equal(s.downloads(),2);
});

test('erro do provedor não vaza conteúdo e arquivo incompatível não é baixado', async () => {
 const s = setup(); s.drive.internals.supported = () => false;
 const result = await s.engine.run(email,uid); assert.equal(s.downloads(),0); assert.equal(result.arquivos[0].estado,'ignorado');
 const broken = setup(); broken.drive.download = async () => { throw new Error('SEGREDO_FICTICIO_NAO_EXIBIR'); };
 const failure = await broken.engine.run(email,uid); assert.equal(JSON.stringify(failure).includes('SEGREDO_FICTICIO'),false);
 assert.equal(failure.arquivos[0].estado,'erro');
});

test('importação de outra origem durante a leitura não escapa da conferência transacional', async () => {
 const s = setup(); s.files.splice(1);
 s.beforeSave(() => s.docs.set('finance_lancamentos/outro-importador', { ...row, valor:12.5, origem:'csv',email,conta_id:'conta-ficticia',cartao_id:null,import_source_id:'outro-arquivo' }));
 const result = await s.engine.run(email,uid); assert.equal(count(s),1); assert.equal(result.arquivos[0].estado,'erro');
 s.beforeSave(null); const retry = await s.engine.run(email,uid); assert.equal(count(s),1); assert.equal(retry.pendentes,1);
});
