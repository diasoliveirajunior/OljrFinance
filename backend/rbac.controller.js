// Backend de administração do porteiro (só admin). Montado em /api/rbac.
//   GET  /solicitacoes[?status=pendente]      fila de pedidos de acesso
//   POST /solicitacoes/decidir                aprovar (cria conta + link) | rejeitar
//   GET  /usuarios                            lista usuários do portal
//   POST /usuarios/atualizar                  ativar/bloquear + papel + painéis
//   GET  /logs[?limit=100]                    log de acessos

const admin = require('firebase-admin');
const { PAINEIS, PAPEIS, ADMIN_EMAIL, sanitizePaineis, sanitizePapel, logAcesso } = require('./rbac');
const nodemailer = require('nodemailer');

// Re-exporta constantes pro access.controller validar prelista sem duplicar lista.
exports.PRELISTA_CATEGORIAS = ['equipe_oljr', 'privado', 'particular'];

const CATEGORIA_LABEL = {
    equipe_oljr: 'Equipe Oliveira Junior - OlJr',
    privado: 'Empresa Privada',
    particular: 'Particular'
};

// URL base do portal — usado nos links dos e-mails. Pode ser override por env var.
function portalUrl() {
    return process.env.PORTAL_URL || 'https://www.oljr.com.br';
}

// Envia o convite de pré-cadastro pra um e-mail. Lança se SMTP falhar — chamador trata.
async function sendConvitePrelista(email, categoria) {
    const label = CATEGORIA_LABEL[categoria] || categoria;
    const link = `${portalUrl()}/?vinculo=${encodeURIComponent(categoria)}`;
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
    });
    const mailOptions = {
        from: `"Portal OlJr" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: 'Você foi convidado - Portal OLJR',
        html: `
            <div style="background:#091016; padding:36px 22px; font-family:Arial,Helvetica,sans-serif;">
                <div style="max-width:560px; margin:0 auto; background:rgba(22,36,54,0.85); border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:32px; color:#ffffff;">
                    <div style="text-align:center; margin-bottom:26px;">
                        <div style="display:inline-block; border:1px solid rgba(255,255,255,0.45); padding:10px 22px; font-size:18px; font-weight:300; letter-spacing:5px; text-transform:uppercase; color:#ffffff;">OLJR.</div>
                    </div>
                    <div style="border-bottom:1px solid rgba(255,255,255,0.10); padding-bottom:12px; margin-bottom:18px;">
                        <h2 style="font-weight:400; color:#ffffff; font-size:20px; margin:0;">Você foi convidado</h2>
                        <p style="font-size:13px; color:#8fa0b5; margin:6px 0 0;">Portal OLJR Analytics · ${escapeHtml(label)}</p>
                    </div>
                    <p style="font-size:15px; line-height:1.65; color:#c7d2e0; margin:0 0 14px;"><strong style="color:#ffffff;">Oliveira Junior</strong></p>
                    <p style="font-size:15px; line-height:1.65; color:#8fa0b5; margin:0 0 14px;">O administrador do portal pré-autorizou seu e-mail <strong style="color:#ffffff;">${escapeHtml(email)}</strong> a se cadastrar como <strong style="color:#ffffff;">${escapeHtml(label)}</strong>.</p>
                    <p style="font-size:15px; line-height:1.65; color:#8fa0b5; margin:0 0 22px;">Pra ativar seu acesso, é só completar o cadastro no portal:</p>
                    <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:8px; padding:16px 18px; margin-bottom:26px;">
                        <div style="margin-bottom:10px;"><span style="display:inline-block; width:22px; height:22px; border-radius:50%; border:1px solid rgba(255,255,255,0.40); text-align:center; line-height:20px; font-size:12px; color:#ffffff; margin-right:8px; vertical-align:middle;">1</span><span style="font-size:13px; color:#c7d2e0;">Acesse o portal e selecione <em>${escapeHtml(label)}</em> no tipo de vínculo</span></div>
                        <div style="margin-bottom:10px;"><span style="display:inline-block; width:22px; height:22px; border-radius:50%; border:1px solid rgba(255,255,255,0.40); text-align:center; line-height:20px; font-size:12px; color:#ffffff; margin-right:8px; vertical-align:middle;">2</span><span style="font-size:13px; color:#c7d2e0;">Receba um código de 6 dígitos por e-mail e crie sua senha</span></div>
                        <div><span style="display:inline-block; width:22px; height:22px; border-radius:50%; border:1px solid rgba(255,255,255,0.40); text-align:center; line-height:20px; font-size:12px; color:#ffffff; margin-right:8px; vertical-align:middle;">3</span><span style="font-size:13px; color:#c7d2e0;">Aguarde a aprovação final do CEO — você recebe um aviso quando liberado</span></div>
                    </div>
                    <div style="text-align:center; margin:28px 0;">
                        <a href="${escapeHtml(link)}" style="background-color:#ffffff; color:#091016; text-decoration:none; padding:14px 36px; font-weight:700; font-size:13px; text-transform:uppercase; letter-spacing:2px; border-radius:4px; display:inline-block;">Acessar portal OLJR</a>
                    </div>
                    <p style="font-size:11px; color:#64748b; line-height:1.5; margin:0 0 6px;">Se o botão acima não funcionar, copie e cole o link:</p>
                    <p style="font-size:11px; word-break:break-all; margin:0 0 22px;"><a href="${escapeHtml(link)}" style="color:#3b82f6;">${escapeHtml(link)}</a></p>
                    <p style="font-size:11px; color:#64748b; line-height:1.5; border-top:1px solid rgba(255,255,255,0.08); padding-top:18px; margin:22px 0 0;">Este convite foi enviado pelo CEO do portal. Se você não esperava receber, pode ignorar — sem o seu cadastro o convite não tem efeito.</p>
                </div>
            </div>
        `
    };
    await transporter.sendMail(mailOptions);
}

// Normaliza expira_em: aceita ISO string ou null. Vazio/inválido vira null.
function sanitizeExpiraEm(v) {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    const t = new Date(s).getTime();
    if (isNaN(t)) return null;
    return new Date(t).toISOString();
}

// Categorias de pré-cadastro. 'publico' NÃO entra aqui — Órgão Público é livre p/ solicitar.
const PRELISTA_CATEGORIAS = ['equipe_oljr', 'privado', 'particular'];

// Org default por categoria, usado quando o admin aprova uma solicitação restrita.
const ORG_POR_CATEGORIA = {
    equipe_oljr: 'Equipe Oliveira Junior - OlJr',
    particular: 'Particular',
    // privado: usa a instituição declarada na solicitação (empresa do solicitante)
};

function sanitizeCategoria(v) {
    const s = String(v || '').trim().toLowerCase();
    return PRELISTA_CATEGORIAS.includes(s) ? s : null;
}

// Escapa HTML em interpolações de e-mail (proteção contra HTML/script injection
// vindos do campo "nome" que originalmente vem do formulário público de solicitação).
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// GET /api/rbac/solicitacoes?status=pendente
exports.listarSolicitacoes = async (req, res) => {
    try {
        const status = req.query.status ? String(req.query.status) : null;
        const db = admin.firestore();
        const col = db.collection('solicitacoes_acesso');
        let snap;
        try {
            snap = status
                ? await col.where('status', '==', status).orderBy('criado_em', 'desc').get()
                : await col.orderBy('criado_em', 'desc').get();
        } catch (_) {
            snap = await col.get(); // fallback se faltar índice composto
        }
        const itens = [];
        snap.forEach(function (d) { itens.push(Object.assign({ id: d.id }, d.data())); });
        const out = status ? itens.filter(function (i) { return i.status === status; }) : itens;
        res.json({ ok: true, solicitacoes: out });
    } catch (e) {
        console.error('rbac.listarSolicitacoes:', e);
        res.status(500).json({ error: 'Erro ao listar solicitações.' });
    }
};

// POST /api/rbac/solicitacoes/decidir { email, decisao:'aprovar'|'rejeitar', papel?, paineis? }
exports.decidirSolicitacao = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const decisao = String(req.body.decisao || '').trim();
        if (!email) return res.status(400).json({ error: 'email é obrigatório.' });
        if (decisao !== 'aprovar' && decisao !== 'rejeitar') {
            return res.status(400).json({ error: "decisao deve ser 'aprovar' ou 'rejeitar'." });
        }

        const db = admin.firestore();
        const sRef = db.collection('solicitacoes_acesso').doc(email);
        const sSnap = await sRef.get();
        if (!sSnap.exists) return res.status(404).json({ error: 'Solicitação não encontrada.' });

        if (decisao === 'rejeitar') {
            await sRef.set({
                status: 'rejeitada',
                decidido_em: admin.firestore.FieldValue.serverTimestamp(),
                decidido_por: req.user.email
            }, { merge: true });
            // Atualiza status na coleção legada para manter sincronia
            await db.collection('users').doc(email).set({ status: 'bloqueado' }, { merge: true });
            logAcesso('solicitacao_rejeitada', req, { alvo: email });
            return res.json({ ok: true, status: 'rejeitada' });
        }

        // --- aprovar ---
        const paineis = sanitizePaineis(req.body.paineis);
        const papel = sanitizePapel(req.body.papel);
        const expira_em = papel === 'convidado' ? sanitizeExpiraEm(req.body.expira_em) : null;
        const sol = sSnap.data();

        // 1. Garante a conta no Firebase Auth e gera o link de ativação (definir senha).
        //    O Firebase gera/expira/valida o token sozinho. Se o provedor Email/Senha
        //    não estiver habilitado, não bloqueia a aprovação (admin reenvia depois).
        let activationLink = null;
        let activationError = null;
        try {
            try {
                await admin.auth().getUserByEmail(email);
            } catch (_) {
                await admin.auth().createUser({
                    email: email,
                    emailVerified: false,
                    displayName: sol.nome || undefined
                });
            }
            activationLink = await admin.auth().generatePasswordResetLink(email);
        } catch (authErr) {
            console.error('rbac.decidir auth:', authErr);
            activationError = authErr.message;
        }

        // 2. Cria/ativa o usuário do portal.
        // 'org' decide o agrupamento na aba Equipe.
        //   - equipe_oljr / particular: rótulo fixo da categoria (mais consistente que confiar no que a pessoa digitou)
        //   - privado / publico: instituição declarada na solicitação
        //   - ceo: bootstrap automático grava "Oliveira Junior" (não passa por aqui)
        const vinculoLower = String(sol.vinculo || '').toLowerCase();
        const orgFinal = ORG_POR_CATEGORIA[vinculoLower] || sol.instituicao || null;

        await db.collection('usuarios').doc(email).set({
            email: email,
            papel: papel,
            ativo: true,
            paineis: paineis,
            nome: sol.nome || null,
            vinculo: sol.vinculo || null,
            instituicao: sol.instituicao || null,
            org: orgFinal,
            expira_em: expira_em,
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            acessos: 0
        }, { merge: true });

        // Atualiza status na coleção legada para manter sincronia
        await db.collection('users').doc(email).set({ status: 'aprovado' }, { merge: true });

        // 3. Fecha a solicitação.
        await sRef.set({
            status: 'aprovada',
            decidido_em: admin.firestore.FieldValue.serverTimestamp(),
            decidido_por: req.user.email
        }, { merge: true });

        // Envia o e-mail de ativação de forma automática se o link existir
        if (activationLink) {
            try {
                const nodemailer = require('nodemailer');
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.SMTP_EMAIL,
                        pass: process.env.SMTP_PASSWORD
                    }
                });

                const mailOptions = {
                    from: `"Portal OlJr" <${process.env.SMTP_EMAIL}>`,
                    to: email,
                    subject: 'Acesso Liberado - Painel OlJr',
                    html: `
                        <div style="font-family: Arial, sans-serif; background-color: #091016; color: #ffffff; padding: 40px 20px; text-align: center;">
                            <div style="max-width: 600px; margin: 0 auto; background: rgba(22, 36, 54, 0.8); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 12px; padding: 30px; text-align: left; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                                <div style="text-align: center; margin-bottom: 30px;">
                                    <div style="display: inline-block; border: 1px solid rgba(255, 255, 255, 0.4); padding: 10px 20px; font-size: 1.5rem; font-weight: 300; letter-spacing: 4px; text-transform: uppercase;">
                                        OLJR.
                                    </div>
                                </div>
                                <h2 style="font-weight: 400; color: #ffffff; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">Acesso Liberado!</h2>
                                <p style="font-size: 1rem; line-height: 1.6; color: #8fa0b5;">Olá, <strong>${escapeHtml(sol.nome || email)}</strong>.</p>
                                <p style="font-size: 1rem; line-height: 1.6; color: #8fa0b5;">Sua solicitação de acesso ao **Portal OLJR Analytics** foi aprovada com sucesso pelo administrador.</p>
                                <p style="font-size: 1rem; line-height: 1.6; color: #8fa0b5;">Para ativar sua conta e definir sua senha de acesso, clique no botão abaixo:</p>
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${escapeHtml(activationLink)}" style="background-color: #ffffff; color: #091016; text-decoration: none; padding: 14px 40px; font-weight: 700; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 2px; border-radius: 4px; display: inline-block;">Ativar Minha Conta</a>
                                </div>
                                <p style="font-size: 0.8rem; line-height: 1.4; color: #64748b;">Se o botão acima não funcionar, copie e cole o seguinte link no seu navegador:</p>
                                <p style="font-size: 0.8rem; word-break: break-all; color: #3b82f6;"><a href="${escapeHtml(activationLink)}" style="color: #3b82f6;">${escapeHtml(activationLink)}</a></p>
                                <br/>
                                <p style="font-size: 0.8rem; color: #64748b; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; margin-top: 20px;">Este é um e-mail automático do sistema. Por favor, não responda a esta mensagem.</p>
                            </div>
                        </div>
                    `
                };
                await transporter.sendMail(mailOptions);
                console.log(`✉️ E-mail de ativação automático enviado para ${email}`);
            } catch (mailErr) {
                console.error('Erro ao enviar e-mail de ativação automático:', mailErr.message);
                activationError = (activationError ? activationError + ' · ' : '') + 'Falha no envio do e-mail: ' + mailErr.message;
            }
        }

        logAcesso('solicitacao_aprovada', req, { alvo: email, papel: papel, paineis: paineis });
        return res.json({ ok: true, status: 'aprovada', activationLink: activationLink, activationError: activationError });
    } catch (e) {
        console.error('rbac.decidirSolicitacao:', e);
        res.status(500).json({ error: 'Erro ao decidir solicitação.' });
    }
};

// GET /api/rbac/usuarios
exports.listarUsuarios = async (req, res) => {
    try {
        const db = admin.firestore();
        let snap;
        try { snap = await db.collection('usuarios').orderBy('criado_em', 'desc').get(); }
        catch (_) { snap = await db.collection('usuarios').get(); }
        const usuarios = [];
        snap.forEach(function (d) { usuarios.push(Object.assign({ id: d.id }, d.data())); });
        res.json({ ok: true, usuarios: usuarios });
    } catch (e) {
        console.error('rbac.listarUsuarios:', e);
        res.status(500).json({ error: 'Erro ao listar usuários.' });
    }
};

// POST /api/rbac/usuarios/atualizar { email, papel?, paineis?, ativo? }
exports.atualizarUsuario = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'email é obrigatório.' });

        // Trava anti-lockout: o dono do portal (CEO único) não pode ser desativado nem rebaixado.
        if (email === ADMIN_EMAIL) {
            const tentaRebaixar = req.body.papel !== undefined &&
                                  req.body.papel !== 'CEO' && req.body.papel !== 'admin';
            if (req.body.ativo === false || tentaRebaixar) {
                return res.status(400).json({ error: 'O CEO dono do portal não pode ser desativado ou rebaixado.' });
            }
        }

        // Trava CEO único: ninguém além do dono pode receber papel CEO.
        if (req.body.papel === 'CEO' && email !== ADMIN_EMAIL) {
            return res.status(400).json({ error: 'O papel CEO é exclusivo do dono do portal.' });
        }

        const patch = {};
        if (typeof req.body.ativo === 'boolean') patch.ativo = req.body.ativo;
        if (req.body.papel !== undefined) patch.papel = sanitizePapel(req.body.papel);
        if (req.body.paineis !== undefined) patch.paineis = sanitizePaineis(req.body.paineis);
        if (req.body.org !== undefined) patch.org = req.body.org ? String(req.body.org).trim() : null;
        if (req.body.expira_em !== undefined) patch.expira_em = sanitizeExpiraEm(req.body.expira_em);
        // Se mudou pra um papel que não é convidado, limpa a expiração.
        if (patch.papel !== undefined && patch.papel !== 'convidado') patch.expira_em = null;
        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ error: 'Nada para atualizar (informe papel, paineis, org, expira_em e/ou ativo).' });
        }

        const db = admin.firestore();
        const ref = db.collection('usuarios').doc(email);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });

        patch.atualizado_em = admin.firestore.FieldValue.serverTimestamp();
        await ref.set(patch, { merge: true });

        // Sincroniza o status 'ativo/bloqueado' com a coleção legada
        if (typeof req.body.ativo === 'boolean') {
            await db.collection('users').doc(email).set({
                status: req.body.ativo ? 'aprovado' : 'bloqueado'
            }, { merge: true });
        }

        logAcesso('usuario_atualizado', req, {
            alvo: email,
            ativo: patch.ativo,
            papel: patch.papel,
            paineis: patch.paineis
        });
        res.json({ ok: true });
    } catch (e) {
        console.error('rbac.atualizarUsuario:', e);
        res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
};

// GET /api/rbac/prelista[?categoria=equipe_oljr|privado|particular]
exports.listarPrelista = async (req, res) => {
    try {
        const db = admin.firestore();
        const cat = sanitizeCategoria(req.query.categoria);
        let snap;
        try {
            snap = cat
                ? await db.collection('prelista_emails').where('categoria', '==', cat).get()
                : await db.collection('prelista_emails').get();
        } catch (_) {
            snap = await db.collection('prelista_emails').get();
        }
        const itens = [];
        snap.forEach(function (d) { itens.push(Object.assign({ id: d.id }, d.data())); });
        const out = cat ? itens.filter(function (i) { return i.categoria === cat; }) : itens;
        res.json({ ok: true, prelista: out });
    } catch (e) {
        console.error('rbac.listarPrelista:', e);
        res.status(500).json({ error: 'Erro ao listar pré-cadastros.' });
    }
};

// POST /api/rbac/prelista/adicionar { email, categoria, nota?, enviar_convite? }
exports.adicionarPrelista = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const categoria = sanitizeCategoria(req.body.categoria);
        const nota = String(req.body.nota || '').trim().slice(0, 300) || null;
        const enviarConvite = req.body.enviar_convite !== false; // default: enviar
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'E-mail inválido.' });
        }
        if (!categoria) {
            return res.status(400).json({ error: 'Categoria inválida. Use equipe_oljr, privado ou particular.' });
        }
        const db = admin.firestore();
        await db.collection('prelista_emails').doc(email).set({
            email: email,
            categoria: categoria,
            nota: nota,
            adicionado_por: req.user.email,
            adicionado_em: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        logAcesso('prelista_adicionado', req, { alvo: email, categoria: categoria, convite: enviarConvite });

        let conviteError = null;
        if (enviarConvite) {
            try {
                await sendConvitePrelista(email, categoria);
            } catch (mailErr) {
                console.error('rbac.adicionarPrelista convite:', mailErr.message);
                conviteError = mailErr.message;
            }
        }
        res.json({ ok: true, conviteEnviado: enviarConvite && !conviteError, conviteError: conviteError });
    } catch (e) {
        console.error('rbac.adicionarPrelista:', e);
        res.status(500).json({ error: 'Erro ao adicionar à pré-lista.' });
    }
};

// POST /api/rbac/prelista/reenviar { email }
exports.reenviarConvitePrelista = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'email é obrigatório.' });
        const db = admin.firestore();
        const snap = await db.collection('prelista_emails').doc(email).get();
        if (!snap.exists) return res.status(404).json({ error: 'E-mail não está na pré-lista.' });
        const categoria = snap.data().categoria;
        try {
            await sendConvitePrelista(email, categoria);
        } catch (mailErr) {
            console.error('rbac.reenviarConvitePrelista:', mailErr.message);
            return res.status(500).json({ error: 'Falha ao enviar e-mail: ' + mailErr.message });
        }
        logAcesso('prelista_convite_reenviado', req, { alvo: email, categoria: categoria });
        res.json({ ok: true });
    } catch (e) {
        console.error('rbac.reenviarConvitePrelista:', e);
        res.status(500).json({ error: 'Erro ao reenviar convite.' });
    }
};

// POST /api/rbac/prelista/remover { email }
exports.removerPrelista = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'email é obrigatório.' });
        const db = admin.firestore();
        await db.collection('prelista_emails').doc(email).delete();
        logAcesso('prelista_removido', req, { alvo: email });
        res.json({ ok: true });
    } catch (e) {
        console.error('rbac.removerPrelista:', e);
        res.status(500).json({ error: 'Erro ao remover da pré-lista.' });
    }
};

// GET /api/rbac/logs?limit=100
exports.listarLogs = async (req, res) => {
    try {
        let limit = parseInt(req.query.limit, 10);
        if (isNaN(limit) || limit <= 0 || limit > 500) limit = 100;
        const db = admin.firestore();
        let snap;
        try { snap = await db.collection('logs_acesso').orderBy('em', 'desc').limit(limit).get(); }
        catch (_) { snap = await db.collection('logs_acesso').limit(limit).get(); }
        const logs = [];
        snap.forEach(function (d) { logs.push(Object.assign({ id: d.id }, d.data())); });
        res.json({ ok: true, logs: logs });
    } catch (e) {
        console.error('rbac.listarLogs:', e);
        res.status(500).json({ error: 'Erro ao listar logs.' });
    }
};

// POST /api/rbac/usuarios/enviar-senha { email }
exports.enviarSenhaUsuario = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'email é obrigatório.' });

        const db = admin.firestore();
        const uSnap = await db.collection('usuarios').doc(email).get();
        if (!uSnap.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });
        const user = uSnap.data();

        // Gera o link de reset/ativação no Firebase Auth
        let resetLink;
        try {
            try {
                await admin.auth().getUserByEmail(email);
            } catch (_) {
                // Cria se não existir no Firebase Auth
                await admin.auth().createUser({
                    email: email,
                    emailVerified: false,
                    displayName: user.nome || undefined
                });
            }
            resetLink = await admin.auth().generatePasswordResetLink(email);
        } catch (authErr) {
            console.error('rbac.enviarSenhaUsuario auth:', authErr);
            return res.status(500).json({ error: 'Erro ao gerar link no Firebase: ' + authErr.message });
        }

        // Envia o e-mail de ativação/redefinição
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_EMAIL,
                pass: process.env.SMTP_PASSWORD
            }
        });

        const mailOptions = {
            from: `"Portal OlJr" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: 'Defina sua Senha - Painel OlJr',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #091016; color: #ffffff; padding: 40px 20px; text-align: center;">
                    <div style="max-width: 600px; margin: 0 auto; background: rgba(22, 36, 54, 0.8); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 12px; padding: 30px; text-align: left; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <div style="display: inline-block; border: 1px solid rgba(255, 255, 255, 0.4); padding: 10px 20px; font-size: 1.5rem; font-weight: 300; letter-spacing: 4px; text-transform: uppercase;">
                                OLJR.
                            </div>
                        </div>
                        <h2 style="font-weight: 400; color: #ffffff; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">Defina sua Senha</h2>
                        <p style="font-size: 1rem; line-height: 1.6; color: #8fa0b5;">Olá, <strong>${escapeHtml(user.nome || email)}</strong>.</p>
                        <p style="font-size: 1rem; line-height: 1.6; color: #8fa0b5;">O administrador solicitou o envio do link para você criar ou redefinir sua senha no **Portal OLJR Analytics**.</p>
                        <p style="font-size: 1rem; line-height: 1.6; color: #8fa0b5;">Clique no botão abaixo para prosseguir:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${escapeHtml(resetLink)}" style="background-color: #ffffff; color: #091016; text-decoration: none; padding: 14px 40px; font-weight: 700; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 2px; border-radius: 4px; display: inline-block;">Definir Senha</a>
                        </div>
                        <p style="font-size: 0.8rem; line-height: 1.4; color: #64748b;">Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
                        <p style="font-size: 0.8rem; word-break: break-all; color: #0056b3;"><a href="${escapeHtml(resetLink)}" style="color: #3b82f6;">${escapeHtml(resetLink)}</a></p>
                        <br/>
                        <p style="font-size: 0.8rem; color: #64748b; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; margin-top: 20px;">Este é um e-mail automático do sistema. Por favor, não responda.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        logAcesso('usuario_link_senha_enviado', req, { alvo: email });
        res.json({ ok: true });
    } catch (e) {
        console.error('rbac.enviarSenhaUsuario:', e);
        res.status(500).json({ error: 'Erro ao enviar link de senha: ' + e.message });
    }
};
