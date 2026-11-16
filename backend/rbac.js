// Porteiro RBAC do Portal OLJR Analytics.
// Valida o ID token do Firebase E o estado em Firestore (ativo + paineis),
// de modo que bloquear/inativar vale na hora mesmo com a senha certa.
//
// Coleções:
//   usuarios/{email}            { email, papel, ativo, paineis[], nome?, ultimo_acesso, criado_em }
//   solicitacoes_acesso/{email} { email, nome, vinculo, instituicao, mensagem, status, criado_em, ... }
//   logs_acesso/{auto}          { evento, email, ip, ua, em, ... }

const admin = require('firebase-admin');

// Dono do portal: bootstrap automático como admin com todos os painéis.
// Nunca consegue se trancar pra fora (ver requireAuth + atualizarUsuario).
const ADMIN_EMAIL = 'diasoliveirajunior@gmail.com';

// Painéis válidos do portal OljrFinance. Só FINANCE — Hub SEDUC ficou no OljrSite.
const PAINEIS = ['FINANCE'];

// Papéis do portal. CEO é único (dono = ADMIN_EMAIL). 'admin' é apelido legado de CEO.
const PAPEIS = ['CEO', 'co_gestor', 'membro', 'convidado'];

function sanitizePapel(p) {
    const s = String(p || '').trim();
    if (s === 'admin') return 'CEO';
    if (s === 'usuario') return 'membro';
    return PAPEIS.includes(s) ? s : 'membro';
}

// Heartbeat de ultimo_acesso é caro se escrito a cada request; só grava
// no máximo a cada 5 min por usuário.
const _lastTouch = new Map();
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function isAdminUser(user) {
    return !!user && (user.email === ADMIN_EMAIL || user.papel === 'CEO' || user.papel === 'admin');
}

// Convidado expirado: 'expira_em' em ISO date. Retorna true se expirou.
function convidadoExpirado(u) {
    if (!u || u.papel !== 'convidado' || !u.expira_em) return false;
    const t = new Date(u.expira_em).getTime();
    return !isNaN(t) && Date.now() > t;
}

function sanitizePaineis(arr) {
    if (!Array.isArray(arr)) return [];
    const set = new Set();
    for (const p of arr) {
        const k = String(p || '').toUpperCase().trim();
        if (PAINEIS.includes(k)) set.add(k);
    }
    return [...set];
}

function logAcesso(evento, req, extra) {
    try {
        const db = admin.firestore();
        const email = (req && (req.user && req.user.email || req.authEmail)) ||
                      (extra && extra.email) || null;
        const ip = req ? (req.headers['x-forwarded-for'] ||
                          (req.socket && req.socket.remoteAddress) || null) : null;
        const ua = req ? String(req.headers['user-agent'] || '').slice(0, 200) : null;
        db.collection('logs_acesso').add(Object.assign({
            evento: evento,
            email: email,
            ip: ip,
            ua: ua,
            em: admin.firestore.FieldValue.serverTimestamp()
        }, extra || {})).catch(function () { /* log nunca quebra a request */ });
    } catch (_) { /* idem */ }
}

function touchUltimoAcesso(ref, email, req) {
    const now = Date.now();
    if (now - (_lastTouch.get(email) || 0) < TOUCH_INTERVAL_MS) return;
    _lastTouch.set(email, now);
    ref.set({
        ultimo_acesso: admin.firestore.FieldValue.serverTimestamp(),
        acessos: admin.firestore.FieldValue.increment(1)
    }, { merge: true })
        .catch(function (e) { console.warn('ultimo_acesso:', e.message); });
    logAcesso('acesso_portal', req);
}

// Só verifica o ID token do Firebase. Não exige acesso/ativo — usado pelos
// endpoints onde a própria pessoa consulta o seu estado (ex.: /api/access/me).
async function requireToken(req, res, next) {
    try {
        const authz = req.headers.authorization || '';
        const idToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : null;
        if (!idToken) return res.status(401).json({ error: 'Não autenticado (faça login).', code: 'sem_token' });
        const decoded = await admin.auth().verifyIdToken(idToken);
        const email = String(decoded.email || decoded.uid || '').toLowerCase();
        if (!email) return res.status(401).json({ error: 'Token sem identidade.', code: 'token_invalido' });
        req.authEmail = email;
        req.firebaseUid = decoded.uid;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.', code: 'token_invalido' });
    }
}

// Token + estado no Firestore. Anexa req.user = { email, papel, ativo, paineis }.
// Rejeita quem não tem acesso (sem_acesso) ou está inativo/bloqueado (inativo).
async function requireAuth(req, res, next) {
    return requireToken(req, res, async function () {
        try {
            const db = admin.firestore();
            const email = req.authEmail;
            const ref = db.collection('usuarios').doc(email);
            const snap = await ref.get();
            let u = snap.exists ? snap.data() : null;

            // Bootstrap do dono do portal — garante CEO/ativo/todos os painéis + org.
            if (email === ADMIN_EMAIL) {
                const papelOk = u && (u.papel === 'CEO' || u.papel === 'admin');
                const orgOk = u && u.org === 'Oliveira Junior';
                const ok = u && u.ativo === true && papelOk && orgOk &&
                           Array.isArray(u.paineis) && u.paineis.length === PAINEIS.length;
                if (!ok) {
                    u = {
                        email: email,
                        papel: 'CEO',
                        ativo: true,
                        paineis: PAINEIS.slice(),
                        nome: (u && u.nome) || 'Administrador',
                        org: 'Oliveira Junior',
                        criado_em: (u && u.criado_em) || admin.firestore.FieldValue.serverTimestamp()
                    };
                    await ref.set(u, { merge: true });
                }
            }

            if (!u) return res.status(403).json({ error: 'Você ainda não tem acesso ao portal.', code: 'sem_acesso' });
            if (u.ativo !== true) return res.status(403).json({ error: 'Seu acesso está inativo ou foi bloqueado.', code: 'inativo' });

            // Convidado expirado: desativa em background e bloqueia o acesso agora.
            if (convidadoExpirado(u)) {
                ref.set({ ativo: false, motivo_inativacao: 'convidado_expirado',
                          inativado_em: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
                    .catch(function (e) { console.warn('expira convidado:', e.message); });
                logAcesso('convidado_expirado', req, { alvo: email });
                return res.status(403).json({ error: 'Seu acesso de convidado expirou.', code: 'expirado' });
            }

            req.user = {
                email: email,
                papel: u.papel || 'usuario',
                ativo: true,
                paineis: Array.isArray(u.paineis) ? u.paineis : []
            };
                    touchUltimoAcesso(ref, email, req);
            next();
        } catch (e) {
            console.error('requireAuth:', e);
            return res.status(500).json({ error: 'Erro ao validar acesso.' });
        }
    });
}

// Exige que o usuário (já passado por requireAuth) tenha o painel. Admin passa sempre.
function requirePanel(painel) {
    return function (req, res, next) {
        if (!req.user) return res.status(401).json({ error: 'Não autenticado.', code: 'sem_token' });
        if (isAdminUser(req.user) || req.user.paineis.includes(painel)) return next();
        return res.status(403).json({ error: 'Você não tem acesso ao painel ' + painel + '.', code: 'painel_negado' });
    };
}

// Exige admin (após requireAuth).
function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.', code: 'sem_token' });
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Acesso restrito ao administrador.', code: 'nao_admin' });
    next();
}

module.exports = {
    ADMIN_EMAIL: ADMIN_EMAIL,
    PAINEIS: PAINEIS,
    PAPEIS: PAPEIS,
    isAdminUser: isAdminUser,
    sanitizePaineis: sanitizePaineis,
    sanitizePapel: sanitizePapel,
    convidadoExpirado: convidadoExpirado,
    logAcesso: logAcesso,
    requireToken: requireToken,
    requireAuth: requireAuth,
    requirePanel: requirePanel,
    requireAdmin: requireAdmin
};
