// Conexão individual do Finance. Nunca usa a conta técnica/Firebase para acessar o Drive.
const admin = require('firebase-admin');
const crypto = require('node:crypto');
const { google } = require('googleapis');
const { hash } = require('./finance-import');
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SITE = 'https://finance.oljr.com.br';
const CALLBACK = `${SITE}/api/finance/storage/callback/google`;
const MAX_BYTES = 3 * 1024 * 1024;
const connectionId = email => `${email}__google`;
const registryId = (email, conta, cartao, file) => hash(JSON.stringify([email, conta || null, cartao || null, file]));
function configured() {
    return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
        process.env.FINANCE_TOKEN_ENCRYPTION_KEY && process.env.FINANCE_OAUTH_STATE_SECRET);
}
function oauth() { return new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET, CALLBACK); }
function error(message, status = 400) { return Object.assign(new Error(message), { publicMessage: message, status }); }
function encrypt(value, owner) {
    const key = crypto.createHash('sha256').update(process.env.FINANCE_TOKEN_ENCRYPTION_KEY || '').digest();
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`finance:google:${owner}`));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return ['v2', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
function decrypt(value, owner) {
    const [version, iv, tag, data] = String(value || '').split('.');
    if (version !== 'v2') throw error('Reconecte o Google Drive para autorizar a leitura da pasta.', 409);
    const key = crypto.createHash('sha256').update(process.env.FINANCE_TOKEN_ENCRYPTION_KEY || '').digest();
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    cipher.setAAD(Buffer.from(`finance:google:${owner}`)); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8');
}
function folderId(value) {
    const text = String(value || '').trim();
    if (/^[a-zA-Z0-9_-]{8,200}$/.test(text)) return text;
    try {
        const url = new URL(text);
        if (url.protocol === 'https:' && url.hostname === 'drive.google.com') {
            const id = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]{8,200})(?:\/|$)/)?.[1];
            if (id) return id;
        }
    } catch { /* orientação única abaixo */ }
    throw error('Cole o link de uma pasta do Google Drive.');
}
function supported(file) {
    return !file.trashed && !String(file.mimeType || '').startsWith('application/vnd.google-apps.') &&
        /\.(ofx|xlsx|csv|pdf)$/i.test(file.name || '') && typeof file.modifiedTime === 'string' && file.modifiedTime.length > 0 && Number(file.size) > 0 && Number(file.size) <= MAX_BYTES;
}
function validateFile(file, folder) {
    if (!file || !file.parents?.includes(folder) || !supported(file)) throw error('Arquivo indisponível na pasta escolhida ou fora dos formatos e limites aceitos.', 400);
}
async function access(email) {
    if (!configured()) throw error('O Google Drive aguarda configuração pelo administrador do Finance.', 503);
    const ref = admin.firestore().collection('finance_storage_connections').doc(connectionId(email));
    const snapshot = await ref.get(); const data = snapshot.exists ? snapshot.data() : null;
    if (!data?.ativo || data.scope !== SCOPE || data.uid == null) throw error('Conecte sua conta Google para ler a pasta de extratos.', 409);
    const client = oauth();
    client.setCredentials({ refresh_token: decrypt(data.refresh_token_encrypted, email) });
    return { data, ref, client, drive: google.drive({ version: 'v3', auth: client }) };
}
function failure(res, err) {
    return res.status(err.publicMessage ? err.status : 503).json({ error: err.publicMessage || 'Não foi possível acessar o Google Drive. Confira a conexão e o acesso à pasta, ou reconecte a conta.' });
}

exports.status = async (req, res) => {
    if (!configured()) return res.json({ configurado: false, conectado: false });
    try {
        const snapshot = await admin.firestore().collection('finance_storage_connections').doc(connectionId(req.user.email)).get();
        const data = snapshot.exists ? snapshot.data() : {};
        const connected = Boolean(data.ativo && data.scope === SCOPE && data.uid === req.firebaseUid);
        res.json({ configurado: true, conectado: connected,
            pasta_nome: connected ? data.pasta_nome || null : null, pasta_url: connected ? data.pasta_url || null : null,
            ...(connected ? { automacao: Boolean(data.automacao), conta_id: data.conta_id || null, cartao_id: data.cartao_id || null,
                ultima_execucao: data.ultima_execucao || null, resultado: data.sync_resultado || null } : {}) });
    } catch (err) { failure(res, err); }
};
exports.start = async (req, res) => {
    if (!configured()) return failure(res, error('O Google Drive aguarda configuração pelo administrador do Finance.', 503));
    try {
        const nonce = crypto.randomBytes(32).toString('hex');
        const signature = crypto.createHmac('sha256', process.env.FINANCE_OAUTH_STATE_SECRET).update(nonce).digest('base64url');
        const verifier = crypto.randomBytes(32).toString('base64url');
        const db = admin.firestore();
        const connection = await db.collection('finance_storage_connections').doc(connectionId(req.user.email)).get();
        await db.collection('finance_google_oauth_requests').doc(nonce).set({
            email: req.user.email, uid: req.firebaseUid, exp: Date.now() + 600000, usado: false,
            revision: connection.exists ? connection.data().revision || 0 : 0,
            verifier: encrypt(verifier, req.user.email),
        });
        res.json({ url: oauth().generateAuthUrl({ access_type: 'offline', prompt: 'consent',
            scope: [SCOPE], state: `${nonce}.${signature}`, code_challenge_method: 'S256',
            code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url') }) });
    } catch (err) { failure(res, err); }
};
exports.callback = async (req, res) => {
    try {
        if (!configured() || req.query.error) throw error('Autorização cancelada.');
        const [nonce, signature] = String(req.query.state || '').split('.');
        if (!/^[a-f0-9]{64}$/.test(nonce) || !signature) throw error('Autorização inválida.');
        const expected = crypto.createHmac('sha256', process.env.FINANCE_OAUTH_STATE_SECRET).update(nonce).digest('base64url');
        if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw error('Autorização inválida.');
        const db = admin.firestore(); const request = db.collection('finance_google_oauth_requests').doc(nonce);
        const saved = await db.runTransaction(async tx => {
            const snapshot = await tx.get(request); const data = snapshot.exists ? snapshot.data() : null;
            if (!data || data.usado || data.exp < Date.now()) throw error('Autorização expirada.');
            tx.update(request, { usado: true }); return data;
        });
        const result = await oauth().getToken({ code: String(req.query.code || ''), codeVerifier: decrypt(saved.verifier, saved.email) });
        if (!result.tokens.refresh_token || !String(result.tokens.scope || '').split(' ').includes(SCOPE)) throw error('Leitura não autorizada.');
        await db.runTransaction(async tx => {
            const ref = db.collection('finance_storage_connections').doc(connectionId(saved.email));
            const [current, user] = await tx.getAll(ref, db.collection('usuarios').doc(saved.email));
            if ((current.exists ? current.data().revision || 0 : 0) !== saved.revision || !user.exists || !user.data().ativo || !user.data().paineis?.includes('FINANCE')) throw error('Autorização encerrada.');
            const previous = current.exists && current.data().uid === saved.uid ? current.data() : {};
            tx.set(ref, { email: saved.email, uid: saved.uid, provider: 'google', ativo: true, scope: SCOPE,
                revision: saved.revision + 1, refresh_token_encrypted: encrypt(result.tokens.refresh_token, saved.email),
                pasta_id: previous.pasta_id || null, pasta_nome: previous.pasta_nome || null, pasta_url: previous.pasta_url || null,
                automacao: Boolean(previous.automacao), conta_id: previous.conta_id || null, cartao_id: previous.cartao_id || null,
                sync_cursor: null, sync_lease: null, sync_lease_until: 0,
                conectado_em: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        });
        await request.delete();
        res.redirect(302, `${SITE}/portal/painel/finance?drive=conectado`);
    } catch { res.redirect(302, `${SITE}/portal/painel/finance?drive=erro`); }
};
exports.setFolder = async (req, res) => {
    try {
        const id = folderId(req.body.pasta);
        const { drive, ref, data } = await access(req.user.email);
        if (data.uid !== req.firebaseUid) throw error('Reconecte o Google Drive nesta sessão.', 409);
        const response = await drive.files.get({ fileId: id, fields: 'id,name,mimeType,trashed', supportsAllDrives: true }, { timeout: 15000 });
        if (response.data.trashed || response.data.mimeType !== 'application/vnd.google-apps.folder') throw error('O link precisa apontar para uma pasta acessível no Google Drive.');
        // Uma reconexão/desconexão concorrente não pode ser sobrescrita por esta escolha.
        await admin.firestore().runTransaction(async tx => {
            const current = await tx.get(ref);
            if (!current.exists || !current.data().ativo || current.data().revision !== data.revision) throw error('A conexão mudou. Atualize a tela.', 409);
            tx.update(ref, { pasta_id: id, pasta_nome: response.data.name, pasta_url: `https://drive.google.com/drive/folders/${id}`,
                revision: data.revision + 1, automacao: false, sync_cursor: null, sync_resultado: null });
        });
        res.json({ ok: true });
    } catch (err) { failure(res, err); }
};
exports.list = async (req, res) => {
    try {
        const { drive, data } = await access(req.user.email);
        if (data.uid !== req.firebaseUid) throw error('Reconecte o Google Drive nesta sessão.', 409);
        if (!data.pasta_id) return res.json({ arquivos: [], proxima_pagina: null });
        const token = String(req.query.pagina || '');
        if (token.length > 2048) throw error('Página inválida.');
        const response = await drive.files.list({ q: `'${folderId(data.pasta_id)}' in parents and trashed = false`,
            fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)', pageSize: 100,
            pageToken: token || undefined, orderBy: 'modifiedTime desc', supportsAllDrives: true, includeItemsFromAllDrives: true }, { timeout: 15000 });
        const files = response.data.files || [];
        const supportedFiles = files.filter(supported);
        const conta = String(req.query.conta_id || ''), cartao = String(req.query.cartao_id || '');
        let revisions = [];
        if (Boolean(conta) !== Boolean(cartao) && !/\//.test(conta + cartao)) {
            const db = admin.firestore();
            const target = await db.collection(conta ? 'finance_contas' : 'finance_cartoes').doc(conta || cartao).get();
            if (!target.exists || target.data().email !== req.user.email) throw error('Escolha uma conta ou cartão deste Finance.');
            if (supportedFiles.length) revisions = await db.getAll(...supportedFiles.map(file => db.collection('finance_drive_revisoes').doc(registryId(req.user.email, conta, cartao, file.id))));
        }
        res.json({ arquivos: supportedFiles.map((file, i) => ({ id: file.id, nome: file.name, modificado_em: file.modifiedTime,
            revisado: Boolean(revisions[i]?.exists && revisions[i].data().versao === file.modifiedTime),
            alterado: Boolean(revisions[i]?.exists && revisions[i].data().versao !== file.modifiedTime) })),
            ignorados: files.filter(file => !supported(file)).length, proxima_pagina: response.data.nextPageToken || null });
    } catch (err) { failure(res, err); }
};
async function fileAccess(email, uid, id) {
    if (!/^[a-zA-Z0-9_-]{8,200}$/.test(String(id || ''))) throw error('Arquivo inválido.');
    const connection = await access(email);
    if (connection.data.uid !== uid || !connection.data.pasta_id) throw error('Escolha uma pasta para esta conexão.', 409);
    const response = await connection.drive.files.get({ fileId: id, fields: 'id,name,mimeType,size,modifiedTime,parents,trashed', supportsAllDrives: true }, { timeout: 15000 });
    validateFile(response.data, connection.data.pasta_id);
    return { ...connection, file: response.data };
}
exports.download = async (email, uid, id) => {
    try {
        const { drive, file } = await fileAccess(email, uid, id);
        const response = await drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'stream', timeout: 15000 });
        const chunks = []; let length = 0;
        for await (const chunk of response.data) {
            length += chunk.length;
            if (length > MAX_BYTES) { response.data.destroy(); throw error('Arquivo maior que 3 MB.'); }
            chunks.push(chunk);
        }
        if (length !== Number(file.size)) throw error('Leitura incompleta do arquivo. Atualize a lista e tente novamente.', 409);
        const current = await fileAccess(email, uid, id);
        if (current.file.modifiedTime !== file.modifiedTime) throw error('Arquivo mudou durante a leitura. Atualize a lista e leia novamente.', 409);
        return { nome: file.name, arquivo: Buffer.concat(chunks).toString('base64'), drive: { file_id: file.id, versao: file.modifiedTime } };
    } catch (err) {
        if (err.publicMessage) throw err;
        throw error('Não foi possível ler o arquivo do Google Drive. Confira a conexão e tente novamente.', 503);
    }
};
exports.validateSource = async (email, uid, source, formato) => {
    const connection = await fileAccess(email, uid, source?.file_id);
    if (connection.file.modifiedTime !== source.versao || connection.file.name.split('.').pop().toLowerCase() !== formato) throw error('Arquivo mudou. Leia a prévia novamente antes de confirmar.', 409);
    return { ...source, revision: connection.data.revision, pasta_id: connection.data.pasta_id };
};
exports.disconnect = async (req, res) => {
    try {
        await admin.firestore().runTransaction(async tx => {
            const ref = admin.firestore().collection('finance_storage_connections').doc(connectionId(req.user.email));
            const snapshot = await tx.get(ref);
            tx.set(ref, { ativo: false, automacao: false, revision: (snapshot.exists ? snapshot.data().revision || 0 : 0) + 1,
                refresh_token_encrypted: admin.firestore.FieldValue.delete(), pasta_id: null, pasta_nome: null, pasta_url: null }, { merge: true });
        });
        res.json({ ok: true });
    } catch (err) { failure(res, err); }
};
exports.internals = { encrypt, decrypt, folderId, supported, validateFile, registryId, SCOPE, configured };

// Navegador de pastas no próprio Finance; não expõe access_token ao navegador.
exports.folders = async (req, res) => {
    try {
        const { drive, data } = await access(req.user.email);
        if (data.uid !== req.firebaseUid) throw error('Reconecte o Google Drive nesta sessão.', 409);
        const parent = req.query.pai === 'root' || !req.query.pai ? 'root' : folderId(req.query.pai);
        const page = String(req.query.pagina || '');
        if (page.length > 2048) throw error('Página inválida.');
        const search = String(req.query.busca || '').trim().slice(0, 100).replace(/['\\]/g, '');
        const q = `trashed = false and mimeType = 'application/vnd.google-apps.folder' and ` +
            (search ? `name contains '${search}'` : `'${parent}' in parents`);
        const result = await drive.files.list({ q, fields: 'nextPageToken,files(id,name)', pageSize: 100,
            pageToken: page || undefined, orderBy: 'name', supportsAllDrives: true, includeItemsFromAllDrives: true }, { timeout: 15000 });
        res.json({ pastas: (result.data.files || []).map(f => ({ id: f.id, nome: f.name })), proxima_pagina: result.data.nextPageToken || null });
    } catch (err) { failure(res, err); }
};
exports.access = access;
