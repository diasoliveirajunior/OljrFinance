const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
    const docs = new Map(); let fail = false;
    const snapshot = id => ({ exists: docs.has(id), data: () => docs.get(id) });
    const collection = name => ({
        doc: id => ({ id: `${name}/${id}` }),
        where(field, op, value) {
            const conditions = [[field, op, value]];
            const query = { conditions, name, where(f, o, v) { return { ...this, conditions: [...this.conditions, [f, o, v]] }; } };
            return query;
        },
    });
    const db = { collection, async runTransaction(work) {
        const writes = [];
        const tx = {
            async get(ref) {
                if (ref.id) return snapshot(ref.id);
                const found = [...docs.entries()].filter(([id, data]) => id.startsWith(`${ref.name}/`) && ref.conditions.every(([field, op, value]) => op === 'in' ? value.includes(data[field]) : data[field] === value));
                return { forEach: visit => found.forEach(([, data]) => visit({ data: () => data })) };
            },
            async getAll(...refs) { return refs.map(ref => snapshot(ref.id)); },
            update(ref, data) { writes.push([ref.id, { ...docs.get(ref.id), ...data }]); },
            create(ref, data) { writes.push([ref.id, data]); },
            set(ref, data) { writes.push([ref.id, data]); },
        };
        const result = await work(tx);
        if (fail) throw new Error('Simulação de falha antes do commit');
        writes.forEach(([id, data]) => docs.set(id, data));
        return result;
    } };
    const firestore = () => db;
    firestore.FieldValue = { serverTimestamp: () => 'timestamp-fictício' };
    const cloud = { async validateSource(_email, _uid, source) {
        if (source.versao !== 'v1') throw Object.assign(new Error('Arquivo mudou.'), { publicMessage: 'Arquivo mudou.', status: 409 });
        return { ...source, revision: 1, pasta_id: 'pasta-ficticia' };
    }, internals: { registryId: () => 'registro-ficticio' } };
    const sandbox = { exports: {}, require: name => name === 'firebase-admin' ? { firestore } : name === './finance-google-drive' ? cloud : require(name), __dirname, setTimeout, clearTimeout };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'finance-import.controller.js'), 'utf8'), sandbox);
    const run = async (body, email = 'exemplo@invalid.test') => {
        const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
        await sandbox.exports.confirmar({ body, user: { email }, firebaseUid: 'uid-ficticio' }, res); return res;
    };
    return { docs, run, fail: () => { fail = true; } };
}
const line = { sourceId: 'ficticio-1', fitid: 'ficticio-1', data: '2026-11-18', descricao: 'Exemplo fictício', valor: '12.34', tipo: 'despesa', categoria: 'Outros' };
const body = { formato: 'ofx', conta_id: 'conta1', cartao_id: null, lancamentos: [line] };
function addOwner(s, id = 'conta1') { s.docs.set(`finance_contas/${id}`, { email: 'exemplo@invalid.test' }); }
const count = s => [...s.docs.keys()].filter(id => id.startsWith('finance_lancamentos/')).length;

test('confirmar duas vezes não duplica; outra conta pode ter o mesmo FITID', async () => {
    const s = setup(); addOwner(s); addOwner(s, 'conta2');
    assert.equal((await s.run(body)).body.importadas, 1);
    assert.equal((await s.run(body)).body.duplicadas, 1);
    assert.equal((await s.run({ ...body, conta_id: 'conta2' })).body.importadas, 1);
    assert.equal(count(s), 2);
});
test('OFX legado é reconhecido somente no mesmo destino e usuário', async () => {
    const s = setup(); addOwner(s); addOwner(s, 'conta2');
    s.docs.set('finance_lancamentos/legado', { email: 'exemplo@invalid.test', conta_id: 'conta1', cartao_id: null, ofx_fitid: line.fitid });
    assert.equal((await s.run(body)).body.duplicadas, 1);
    assert.equal((await s.run({ ...body, conta_id: 'conta2' })).body.importadas, 1);
});
test('destino de outra pessoa, dados inválidos e lote grande não gravam', async () => {
    const s = setup(); addOwner(s);
    assert.equal((await s.run(body, 'outra@invalid.test')).code, 400);
    assert.equal((await s.run({ ...body, lancamentos: [{ ...line, valor: '-2.00' }] })).code, 400);
    assert.equal((await s.run({ ...body, lancamentos: Array(401).fill(line) })).code, 400);
    assert.equal(count(s), 0);
});
test('falha na transação não deixa importação parcial', async () => {
    const s = setup(); addOwner(s); s.fail();
    assert.equal((await s.run(body)).code, 500);
    assert.equal(count(s), 0);
});
test('mesmo identificador com valores divergentes exige revisão', async () => {
    const s = setup(); addOwner(s);
    const result = await s.run({ ...body, lancamentos: [line, { ...line, valor: '2.00' }] });
    assert.equal(result.code, 400);
    assert.equal(count(s), 0);
});
test('Drive registra a versão na mesma transação dos movimentos', async () => {
    const s = setup(); addOwner(s);
    s.docs.set('finance_storage_connections/exemplo@invalid.test__google', { ativo: true, uid: 'uid-ficticio', revision: 1, pasta_id: 'pasta-ficticia' });
    const result = await s.run({ ...body, drive: { file_id: 'arquivo-ficticio', versao: 'v1' } });
    assert.equal(result.code, 200);
    assert.equal(s.docs.get('finance_drive_revisoes/registro-ficticio').versao, 'v1');
    assert.equal((await s.run({ ...body, drive: { file_id: 'arquivo-ficticio', versao: 'antiga' } })).code, 409);
    assert.equal(count(s), 1);
});
test('Drive desconectado entre a prévia e a confirmação não grava', async () => {
    const s = setup(); addOwner(s);
    s.docs.set('finance_storage_connections/exemplo@invalid.test__google', { ativo: false, uid: 'uid-ficticio', revision: 2, pasta_id: 'pasta-ficticia' });
    const result = await s.run({ ...body, drive: { file_id: 'arquivo-ficticio', versao: 'v1' } });
    assert.equal(result.code, 500); assert.equal(count(s), 0);
});
