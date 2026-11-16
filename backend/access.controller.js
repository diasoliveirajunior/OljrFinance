// Endpoints do lado de quem PEDE acesso (não-admin).
//   POST /api/access/solicitar  -> pública (a pessoa ainda não tem conta)
//   GET  /api/access/me         -> requireToken (depois de logar, saber o status)

const admin = require('firebase-admin');
const { ADMIN_EMAIL, PAINEIS, logAcesso } = require('./rbac');
const { PRELISTA_CATEGORIAS } = require('./rbac.controller');
const { notifyNewAccessRequest } = require('./notifications');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mensagens de rejeição por categoria — pra a pessoa entender o que fazer a seguir.
const MSG_PRELISTA = {
    equipe_oljr: 'E-mail não autorizado. A inscrição como Equipe Oliveira Junior - OlJr exige pré-cadastro feito pelo CEO. Solicite a inclusão do seu e-mail.',
    privado: 'E-mail não autorizado. A inscrição como Empresa Privada exige pré-cadastro feito pelo CEO. Solicite a inclusão do seu e-mail corporativo.',
    particular: 'E-mail não autorizado. A inscrição como Particular exige pré-cadastro feito pelo CEO. Solicite a inclusão do seu e-mail.'
};

// POST /api/access/solicitar  { email, nome, vinculo?, instituicao?, mensagem? }
exports.solicitar = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const nome = String(req.body.nome || '').trim();
        const vinculo = String(req.body.vinculo || '').trim().toLowerCase();
        const instituicao = String(req.body.instituicao || '').trim();
        const mensagem = String(req.body.mensagem || '').trim().slice(0, 1000);

        if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
        if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

        const db = admin.firestore();

        // CEO continua exclusivo do dono — sem pré-lista, é o único e-mail aceito.
        if (vinculo === 'ceo') {
            if (email !== ADMIN_EMAIL.toLowerCase()) {
                return res.status(400).json({ error: 'O vínculo CEO é exclusivo do dono do portal.' });
            }
        }

        // Vínculos restritos: exige e-mail na prelista (gerenciada pelo admin).
        if (PRELISTA_CATEGORIAS.includes(vinculo)) {
            const preSnap = await db.collection('prelista_emails').doc(email).get();
            const cat = preSnap.exists ? preSnap.data().categoria : null;
            if (!preSnap.exists || cat !== vinculo) {
                return res.status(403).json({
                    error: MSG_PRELISTA[vinculo] || 'E-mail não autorizado para este tipo de vínculo.'
                });
            }
        }

        // Já tem acesso ativo? Não precisa solicitar.
        const uSnap = await db.collection('usuarios').doc(email).get();
        if ((uSnap.exists && uSnap.data().ativo === true) || email === ADMIN_EMAIL) {
            return res.status(200).json({ ok: true, status: 'ja_ativo', message: 'Você já tem acesso. Faça login.' });
        }

        // Solicitação já pendente? Idempotente.
        const ref = db.collection('solicitacoes_acesso').doc(email);
        const sSnap = await ref.get();
        if (sSnap.exists && sSnap.data().status === 'pendente') {
            return res.status(200).json({ ok: true, status: 'pendente', message: 'Sua solicitação já foi recebida e está em análise.' });
        }

        await ref.set({
            email: email,
            nome: nome,
            vinculo: vinculo || null,
            instituicao: instituicao || null,
            mensagem: mensagem || null,
            status: 'pendente',
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            decidido_em: null,
            decidido_por: null
        }, { merge: true });

        logAcesso('solicitacao_acesso', req, { email: email });

        // Notifica o admin (email + WhatsApp) — async, nao bloqueia a resposta.
        // Se SMTP ou WhatsApp falharem, a solicitacao continua salva normalmente.
        notifyNewAccessRequest({ email, nome, vinculo, instituicao, mensagem })
            .catch((e) => console.error('notifyNewAccessRequest:', e?.message || e));

        return res.status(201).json({ ok: true, status: 'pendente', message: 'Solicitação enviada. Você será avisado quando for aprovada.' });
    } catch (e) {
        console.error('access.solicitar:', e);
        return res.status(500).json({ error: 'Erro ao enviar solicitação.' });
    }
};

// GET /api/access/me  -> status do solicitante autenticado (o hub usa para rotear).
exports.me = async (req, res) => {
    try {
        const email = req.authEmail;
        const isAdmin = email === ADMIN_EMAIL;
        const db = admin.firestore();

        const uSnap = await db.collection('usuarios').doc(email).get();
        if (uSnap.exists || isAdmin) {
            const u = uSnap.exists ? uSnap.data() : {};
            const ativo = isAdmin ? true : (u.ativo === true);
            const paineis = isAdmin ? PAINEIS.slice() : (Array.isArray(u.paineis) ? u.paineis : []);
            return res.json({
                autenticado: true,
                email: email,
                status: ativo ? 'ativo' : 'inativo',
                usuario: {
                    email: email,
                    nome: u.nome || (isAdmin ? "José Dias de Oliveira Junior" : ""),
                    vinculo: u.vinculo || (isAdmin ? "ceo" : null),
                    instituicao: u.instituicao || (isAdmin ? "OlJr" : null),
                    papel: isAdmin ? 'admin' : (u.papel || 'usuario'),
                    ativo: ativo,
                    paineis: paineis
                }
            });
        }

        const sSnap = await db.collection('solicitacoes_acesso').doc(email).get();
        if (sSnap.exists) {
            const st = sSnap.data().status || 'pendente';
            return res.json({ autenticado: true, email: email, status: 'solicitacao_' + st, solicitacao: { status: st } });
        }

        return res.json({ autenticado: true, email: email, status: 'sem_acesso' });
    } catch (e) {
        console.error('access.me:', e);
        return res.status(500).json({ error: 'Erro ao consultar perfil.' });
    }
};
