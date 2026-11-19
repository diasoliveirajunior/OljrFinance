// OAuth e Drive simulados. Nunca usa credenciais nem contas reais.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Readable } = require('node:stream');
const scope = 'https://www.googleapis.com/auth/drive.readonly';
const email = 'ficticio@invalid.test'; const uid = 'uid-ficticio';
function setup() {
    const docs = new Map(), files = new Map(); let authOptions; let mutateDownload = false; let listOptions;
    const snapshot = ref => ({ exists: docs.has(ref.key), data: () => docs.get(ref.key) });
    const apply = (ref, data, options) => docs.set(ref.key, options?.merge ? { ...docs.get(ref.key), ...data } : data);
    const collection = name => ({ doc(id) {
        const ref = { key: `${name}/${id}`, async get() { return snapshot(ref); }, async set(data, opts) { apply(ref, data, opts); }, async delete() { docs.delete(ref.key); } }; return ref;
    } });
    const db = { collection, async getAll(...refs) { return refs.map(snapshot); }, async runTransaction(work) {
        const writes = [];
        const result = await work({ async get(ref) { return snapshot(ref); }, async getAll(...refs) { return refs.map(snapshot); },
            set(ref, data, options) { writes.push(() => apply(ref, data, options)); }, update(ref, data) { writes.push(() => apply(ref, data, { merge: true })); } });
        writes.forEach(write => write()); return result;
    } };
    const firestore = () => db;
    firestore.FieldValue = { serverTimestamp: () => 'hora-ficticia', delete: () => null };
    class OAuth2 {
        setCredentials(value) { this.credentials = value; }
        generateAuthUrl(options) { authOptions = options; return `https://accounts.google.com/o/oauth2/v2/auth?state=${options.state}`; }
        async getToken(options) { assert.ok(options.codeVerifier); return { tokens: { refresh_token: 'token-ficticio', scope } }; }
    }
    const drive = { files: {
        async get(options) {
            if (options.alt === 'media') {
                if (mutateDownload) files.get(options.fileId).modifiedTime = 'nova-versao';
                return { data: Readable.from([Buffer.from('conteudo-ficticio')]) };
            }
            const file = files.get(options.fileId); if (!file) throw new Error('Erro do provedor contendo texto que não deve ser exposto');
            return { data: { ...file } };
        },
        async list(options) { listOptions = options; return { data: { files: [...files.values()].filter(f => f.parents?.includes('pasta-ficticia')) } }; },
    } };
    const env = { GOOGLE_DRIVE_CLIENT_ID: 'cliente-ficticio', GOOGLE_DRIVE_CLIENT_SECRET: 'segredo-ficticio',
        FINANCE_TOKEN_ENCRYPTION_KEY: 'chave-ficticia-de-teste', FINANCE_OAUTH_STATE_SECRET: 'estado-ficticio-de-teste' };
    const sandbox = { exports: {}, process: { env }, URL, Buffer, Date, require: name => name === 'firebase-admin' ? { firestore } : name === 'googleapis' ? { google: { auth: { OAuth2 }, drive: () => drive } } : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'finance-google-drive.js'), 'utf8'), sandbox);
    const api = sandbox.exports;
    const run = async (action, body = {}, query = {}, user = email, firebaseUid = uid) => {
        const res = { code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; }, redirect(code, url) { this.code = code; this.url = url; } };
        await api[action]({ body, query, user: { email: user }, firebaseUid }, res); return res;
    };
    const connect = () => docs.set(`finance_storage_connections/${email}__google`, { ativo: true, email, uid, scope, revision: 1,
        pasta_id: 'pasta-ficticia', pasta_nome: 'Pasta fictícia', refresh_token_encrypted: api.internals.encrypt('token-ficticio', email) });
    files.set('pasta-ficticia', { id: 'pasta-ficticia', name: 'Pasta fictícia', mimeType: 'application/vnd.google-apps.folder' });
    files.set('arquivo-ficticio', { id: 'arquivo-ficticio', name: 'exemplo.csv', mimeType: 'text/csv', size: Buffer.byteLength('conteudo-ficticio'), modifiedTime: 'versao1', parents: ['pasta-ficticia'] });
    docs.set(`usuarios/${email}`, { ativo: true, paineis: ['FINANCE'] });
    return { api, run, docs, files, env, connect, listOptions: () => listOptions, options: () => authOptions, mutate: () => { mutateDownload = true; } };
}

test('configuração ausente aparece claramente sem tentar OAuth', async () => {
    const s = setup(); delete s.env.GOOGLE_DRIVE_CLIENT_ID;
    assert.equal((await s.run('status')).body.configurado, false);
    assert.equal((await s.run('start')).code, 503);
});
test('criptografia é vinculada ao usuário e links de pastas são validados', () => {
    const s = setup(); const c = s.api.internals.encrypt('token-ficticio', email);
    assert.equal(s.api.internals.decrypt(c, email), 'token-ficticio');
    assert.throws(() => s.api.internals.decrypt(c, 'outra@invalid.test'));
    assert.equal(s.api.internals.folderId('https://drive.google.com/drive/folders/pasta-ficticia'), 'pasta-ficticia');
    assert.throws(() => s.api.internals.folderId('https://site-falso.invalid/drive/folders/pasta-ficticia'));
});
test('OAuth usa PKCE, estado de uso único e retorna apenas ao Finance', async () => {
    const s = setup(); await s.run('start'); const opts = s.options();
    assert.equal(opts.scope[0], scope); assert.equal(opts.code_challenge_method, 'S256');
    assert.ok(!opts.state.includes(email));
    const first = await s.run('callback', {}, { state: opts.state, code: 'codigo-ficticio' });
    assert.equal(first.url, 'https://finance.oljr.com.br/portal/painel/finance?drive=conectado');
    assert.equal((await s.run('callback', {}, { state: opts.state, code: 'codigo-ficticio' })).url.endsWith('drive=erro'), true);
});
test('desconexão impede callback antigo de reativar a conexão', async () => {
    const s = setup(); s.connect(); await s.run('start'); const opts = s.options(); await s.run('disconnect');
    const result = await s.run('callback', {}, { state: opts.state, code: 'codigo-ficticio' });
    assert.equal(result.url.endsWith('drive=erro'), true);
    assert.equal(s.docs.get(`finance_storage_connections/${email}__google`).ativo, false);
});
test('download rejeita arquivo fora da pasta, alteração de versão e outro usuário', async () => {
    const s = setup(); s.connect();
    assert.equal((await s.api.download(email, uid, 'arquivo-ficticio')).drive.versao, 'versao1');
    await assert.rejects(s.api.download(email, 'outro-uid', 'arquivo-ficticio'));
    await assert.rejects(s.api.download('outra@invalid.test', uid, 'arquivo-ficticio'));
    s.files.get('arquivo-ficticio').parents = ['outra-pasta'];
    await assert.rejects(s.api.download(email, uid, 'arquivo-ficticio'));
    s.files.get('arquivo-ficticio').parents = ['pasta-ficticia']; s.mutate();
    await assert.rejects(s.api.download(email, uid, 'arquivo-ficticio'), /mudou/);
});
test('listagem não expõe token e erros do provedor não vazam detalhes', async () => {
    const s = setup(); s.connect();
    const result = await s.run('list'); assert.equal(result.body.arquivos.length, 1);
    assert.equal(JSON.stringify(result.body).includes('token-ficticio'), false);
    const failure = await s.run('setFolder', { pasta: 'pasta-inexistente' });
    assert.equal(failure.code, 503); assert.equal(failure.body.error.includes('texto que não deve'), false);
});
test('arquivo alterado desde a prévia exige releitura antes de confirmar', async () => {
    const s = setup(); s.connect();
    await assert.rejects(s.api.validateSource(email, uid, { file_id: 'arquivo-ficticio', versao: 'antiga' }, 'csv'), /mudou/);
    const result = await s.api.validateSource(email, uid, { file_id: 'arquivo-ficticio', versao: 'versao1' }, 'csv');
    assert.equal(result.pasta_id, 'pasta-ficticia');
});
test('uma sessão de outra identidade não recebe nem o nome da pasta', async () => {
    const s = setup(); s.connect();
    const result = await s.run('status', {}, {}, email, 'outro-uid');
    assert.equal(result.body.conectado, false);
    assert.equal(result.body.pasta_nome, null);
});


test('navegação visual de pastas não entrega tokens nem aceita outra identidade', async () => {
 const s = setup(); s.connect();
 const listed = await s.run('folders', {}, { pai: 'root', busca: "Exemplo' or trashed = true" });
 assert.equal(listed.code, 200);
 assert.equal(JSON.stringify(listed.body).includes('token-ficticio'), false);
 assert.equal(s.listOptions().q.includes("Exemplo' or"), false);
 assert.equal((await s.run('folders', {}, {}, email, 'outra-identidade')).code, 409);
 assert.equal((await s.run('folders', {}, { pai: 'https://site-invalido.test/pasta' })).code, 400);
});

test('renovar consentimento da mesma pessoa preserva pasta e destino', async () => {
 const s = setup(); s.connect();
 Object.assign(s.docs.get(`finance_storage_connections/${email}__google`), {automacao:true,conta_id:'conta-ficticia',cartao_id:null});
 await s.run('start'); await s.run('callback', {}, {state:s.options().state,code:'codigo-ficticio'});
 const saved = s.docs.get(`finance_storage_connections/${email}__google`);
 assert.equal(saved.pasta_id,'pasta-ficticia'); assert.equal(saved.conta_id,'conta-ficticia'); assert.equal(saved.automacao,true);
});
