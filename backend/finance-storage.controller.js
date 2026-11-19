const admin = require('firebase-admin');
const crypto = require('crypto');
const { google } = require('googleapis');

const SITE_URL = String(process.env.PUBLIC_SITE_URL || 'https://www.oljr.com.br').replace(/\/$/, '');
const CALLBACK_BASE = `${SITE_URL}/api/finance/storage/callback`;

function providerConfig(provider) {
    if (provider === 'google') return {
        clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
        configured: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET)
    };
    if (provider === 'microsoft') return {
        clientId: process.env.MICROSOFT_DRIVE_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_DRIVE_CLIENT_SECRET,
        tenant: process.env.MICROSOFT_DRIVE_TENANT_ID || 'common',
        configured: Boolean(process.env.MICROSOFT_DRIVE_CLIENT_ID && process.env.MICROSOFT_DRIVE_CLIENT_SECRET)
    };
    return null;
}

function stateSecret() {
    return process.env.FINANCE_OAUTH_STATE_SECRET || process.env.SESSION_SECRET || null;
}

function encryptionKey() {
    const secret = process.env.FINANCE_TOKEN_ENCRYPTION_KEY;
    return secret ? crypto.createHash('sha256').update(secret).digest() : null;
}

function signState(payload) {
    const secret = stateSecret();
    if (!secret) throw new Error('FINANCE_OAUTH_STATE_SECRET não configurado');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
}

function verifyState(value) {
    const secret = stateSecret();
    if (!secret || !value || !value.includes('.')) throw new Error('Estado OAuth inválido');
    const [body, signature] = value.split('.');
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        throw new Error('Estado OAuth inválido');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) throw new Error('Autorização expirada');
    return payload;
}

function encrypt(value) {
    const key = encryptionKey();
    if (!key) throw new Error('FINANCE_TOKEN_ENCRYPTION_KEY não configurada');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((x) => x.toString('base64url')).join('.');
}

function connectionRef(email, provider) {
    return admin.firestore().collection('finance_storage_connections').doc(`${email}__${provider}`);
}

exports.status = async (req, res) => {
    const email = req.user.email;
    const snapshots = await Promise.all(['google', 'microsoft'].map((p) => connectionRef(email, p).get()));
    const providers = {};
    ['google', 'microsoft'].forEach((provider, index) => {
        const cfg = providerConfig(provider);
        const data = snapshots[index].exists ? snapshots[index].data() : null;
        const connected = Boolean(data && data.ativo && (provider !== 'google' ||
            data.uid === req.firebaseUid && data.scope === 'https://www.googleapis.com/auth/drive.readonly'));
        providers[provider] = {
            configurado: cfg.configured,
            conectado: connected,
            pasta_nome: connected ? data?.pasta_nome || null : null,
            pasta_url: connected ? data?.pasta_url || null : null,
            conectado_em: connected ? data?.conectado_em || null : null
        };
    });
    res.json({ providers });
};

exports.start = async (req, res) => {
    try {
        const provider = String(req.params.provider || '');
        const cfg = providerConfig(provider);
        if (!cfg) return res.status(400).json({ error: 'Provedor inválido.' });
        if (!cfg.configured) return res.status(503).json({
            error: provider === 'google'
                ? 'A conexão Google ainda precisa das credenciais OAuth no servidor.'
                : 'A conexão Microsoft ainda precisa das credenciais OAuth no servidor.',
            code: 'oauth_nao_configurado'
        });
        if (!stateSecret() || !encryptionKey()) {
            return res.status(503).json({ error: 'A proteção dos tokens ainda precisa ser configurada no servidor.' });
        }
        const state = signState({
            email: req.user.email,
            uid: req.firebaseUid,
            provider,
            nonce: crypto.randomBytes(16).toString('hex'),
            exp: Date.now() + 10 * 60 * 1000
        });
        let url;
        if (provider === 'google') {
            const oauth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, `${CALLBACK_BASE}/google`);
            url = oauth.generateAuthUrl({
                access_type: 'offline', prompt: 'consent',
                scope: ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'], state
            });
        } else {
            const authUrl = new URL(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/authorize`);
            authUrl.search = new URLSearchParams({
                client_id: cfg.clientId, response_type: 'code',
                redirect_uri: `${CALLBACK_BASE}/microsoft`, response_mode: 'query',
                scope: 'openid profile email offline_access Files.ReadWrite.AppFolder', state
            }).toString();
            url = authUrl.toString();
        }
        res.json({ url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

async function setupGoogle(code, cfg) {
    const oauth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, `${CALLBACK_BASE}/google`);
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error('O Google não forneceu autorização permanente. Tente novamente.');
    oauth.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth });
    const folder = await drive.files.create({
        requestBody: { name: 'Extratos OLJR', mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id,name,webViewLink'
    });
    return {
        refreshToken: tokens.refresh_token, pasta_id: folder.data.id,
        pasta_nome: folder.data.name,
        pasta_url: folder.data.webViewLink || `https://drive.google.com/drive/folders/${folder.data.id}`
    };
}

async function setupMicrosoft(code, cfg) {
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: cfg.clientId, client_secret: cfg.clientSecret, code,
            redirect_uri: `${CALLBACK_BASE}/microsoft`, grant_type: 'authorization_code',
            scope: 'openid profile email offline_access Files.ReadWrite.AppFolder'
        })
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokens.error_description || 'Falha ao autorizar Microsoft.');
    const folderResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/special/approot', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const folder = await folderResponse.json();
    if (!folderResponse.ok) throw new Error(folder.error?.message || 'Falha ao criar pasta no OneDrive.');
    return {
        refreshToken: tokens.refresh_token, pasta_id: folder.id,
        pasta_nome: 'Extratos OLJR', pasta_url: folder.webUrl
    };
}

exports.callback = async (req, res) => {
    try {
        if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
        const provider = String(req.params.provider || '');
        const payload = verifyState(String(req.query.state || ''));
        if (payload.provider !== provider) throw new Error('Provedor OAuth divergente.');
        const cfg = providerConfig(provider);
        if (!cfg?.configured) throw new Error('Provedor não configurado.');
        const result = provider === 'google'
            ? await setupGoogle(String(req.query.code || ''), cfg)
            : await setupMicrosoft(String(req.query.code || ''), cfg);
        await connectionRef(payload.email, provider).set({
            email: payload.email, provider, ativo: true,
            refresh_token_encrypted: encrypt(result.refreshToken),
            pasta_id: result.pasta_id, pasta_nome: result.pasta_nome, pasta_url: result.pasta_url,
            conectado_em: admin.firestore.FieldValue.serverTimestamp(),
            atualizado_em: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.redirect(302, `${SITE_URL}/finance?armazenamento=conectado&provedor=${provider}`);
    } catch (error) {
        console.error('finance.storage.callback:', error);
        res.redirect(302, `${SITE_URL}/finance?armazenamento=erro&mensagem=${encodeURIComponent(error.message)}`);
    }
};

exports.disconnect = async (req, res) => {
    const provider = String(req.params.provider || '');
    if (!providerConfig(provider)) return res.status(400).json({ error: 'Provedor inválido.' });
    await connectionRef(req.user.email, provider).set({
        ativo: false,
        refresh_token_encrypted: admin.firestore.FieldValue.delete(),
        desconectado_em: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    res.json({ ok: true });
};
