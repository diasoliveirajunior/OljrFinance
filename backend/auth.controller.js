const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { PRELISTA_CATEGORIAS } = require('./rbac.controller');

const ADMIN_EMAIL = 'diasoliveirajunior@gmail.com';

// Mensagens de rejeição por categoria — pra a pessoa entender o que fazer a seguir.
const MSG_PRELISTA = {
    equipe_oljr: 'E-mail não autorizado. A inscrição como Equipe Oliveira Junior - OlJr exige pré-cadastro feito pelo CEO. Solicite a inclusão do seu e-mail.',
    privado: 'E-mail não autorizado. A inscrição como Empresa Privada exige pré-cadastro feito pelo CEO. Solicite a inclusão do seu e-mail corporativo.',
    particular: 'E-mail não autorizado. A inscrição como Particular exige pré-cadastro feito pelo CEO. Solicite a inclusão do seu e-mail.'
};

// Verifica se o e-mail está na prelista pra a categoria pedida. Retorna mensagem de erro ou null.
// Defensivo: se Firestore falhar, loga e retorna null (fail-open). A política é menos pior
// que derrubar o cadastro inteiro com 500 — o admin ainda revisa antes de aprovar.
async function validarPrelista(email, vinculo) {
    if (vinculo === 'ceo') {
        if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            return 'O vínculo CEO é exclusivo do dono do portal.';
        }
        return null;
    }
    if (!PRELISTA_CATEGORIAS.includes(vinculo)) return null; // publico ou outro = livre
    try {
        const db = admin.firestore();
        const snap = await db.collection('prelista_emails').doc(email.toLowerCase()).get();
        const cat = snap.exists ? snap.data().categoria : null;
        if (!snap.exists || cat !== vinculo) {
            return MSG_PRELISTA[vinculo] || 'E-mail não autorizado para este tipo de vínculo.';
        }
        return null;
    } catch (e) {
        console.error('validarPrelista falhou (fail-open):', e.message);
        return null;
    }
}

// Escapa HTML para uso seguro em templates de e-mail (evita injection via nome, etc).
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Comparação constante-no-tempo de strings. Evita timing attack na verificação do token.
function safeStringEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

// Configuração do Transportador de E-mail (Nodemailer)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

/**
 * Função para gerar um token numérico aleatório de 6 dígitos
 */
function generateToken() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Rota 1: Solicita Token via E-mail
 */
exports.requestToken = async (req, res) => {
    try {
        const { email, type } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'E-mail é obrigatório.' });
        }

        // Validação básica do formato de e-mail
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'E-mail em formato inválido.' });
        }

        // Se o cadastro declarou vínculo restrito, valida a prelista ANTES de gastar SMTP.
        // type vem só no cadastro novo; no login (re-envio) vem vazio → pula.
        if (type) {
            const erro = await validarPrelista(email, String(type).toLowerCase());
            if (erro) return res.status(403).json({ error: erro });
        }

        // Gera token e define validade de 10 minutos
        const token = generateToken();
        const expiresAt = Date.now() + 10 * 60 * 1000;

        // Grava no Firestore (banco de dados)
        const db = admin.firestore();
        await db.collection('tokens_temp').doc(email).set({
            token: token,
            expiresAt: expiresAt,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Envia o e-mail
        // token é gerado pelo servidor (6 dígitos), seguro; escape mesmo assim por consistência.
        const mailOptions = {
            from: `"Portal OlJr" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: 'Seu Código de Acesso - Painel OlJr',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2>Código de Autenticação</h2>
                    <p>Você solicitou acesso ao painel OlJr.</p>
                    <p>Seu código numérico de 6 dígitos é:</p>
                    <h1 style="color: #0056b3; letter-spacing: 5px;">${escapeHtml(token)}</h1>
                    <p><em>Este código é válido por apenas 10 minutos.</em></p>
                    <br/>
                    <p>Se você não solicitou este acesso, ignore este e-mail.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        
        return res.status(200).json({ message: 'Token enviado com sucesso.' });

    } catch (error) {
        console.error("Erro ao solicitar token:", error);
        return res.status(500).json({ error: 'Erro interno ao processar solicitação.' });
    }
};

/**
 * Rota 2: Verifica o token e retorna Custom Token do Firebase Auth
 */
exports.verifyToken = async (req, res) => {
    try {
        const { email, token, name, type, institution } = req.body;

        if (!email || !token) {
            return res.status(400).json({ error: 'E-mail e Token são obrigatórios.' });
        }

        const db = admin.firestore();
        const tokenDocRef = db.collection('tokens_temp').doc(email);
        const tokenDoc = await tokenDocRef.get();

        if (!tokenDoc.exists) {
            return res.status(401).json({ error: 'Nenhum token encontrado para este e-mail.' });
        }

        const tokenData = tokenDoc.data();

        // Verifica se o token expirou (10 min)
        if (Date.now() > tokenData.expiresAt) {
            await tokenDocRef.delete(); // Limpa o token expirado
            return res.status(401).json({ error: 'Token expirado. Por favor, solicite um novo.' });
        }

        // Verifica se o token digitado está correto (comparação constante-no-tempo).
        if (!safeStringEqual(tokenData.token, token)) {
            return res.status(401).json({ error: 'Código incorreto.' });
        }

        // O token está certo! 
        // 1. Apaga o token usado para segurança
        await tokenDocRef.delete();

        const isAdmin = (email === ADMIN_EMAIL);
        const isNewUser = !!name; // Cadastro novo se veio com nome

        // 2. Prepara os dados do usuário
        const userData = {
            Ultima_Validacao: Date.now()
        };

        if (isNewUser) {
            // Defesa em profundidade: valida prelista também no verify-token, caso alguém
            // pule o request-token (chamando direto a API).
            const erroPrelista = await validarPrelista(email, String(type || '').toLowerCase());
            if (erroPrelista) return res.status(403).json({ error: erroPrelista });

            // Dados de perfil vindos do formulário de cadastro
            if (name) userData.nome = name;
            if (type) userData.vinculo = type;
            if (institution) userData.instituicao = institution;

            // Admin é aprovado automaticamente; demais ficam pendentes
            userData.status = isAdmin ? 'aprovado' : 'pendente';
            userData.createdAt = admin.firestore.FieldValue.serverTimestamp();

            // Grava na coleção legada para retrocompatibilidade
            await db.collection('users').doc(email).set(userData, { merge: true });

            // Grava nas novas coleções do portal unificado
            if (isAdmin) {
                await db.collection('usuarios').doc(email).set({
                    email: email,
                    nome: name || 'Administrador',
                    papel: 'admin',
                    ativo: true,
                    paineis: ['GSAAS', 'SUAC', 'CGA', 'CGC'],
                    criado_em: admin.firestore.FieldValue.serverTimestamp(),
                    acessos: 0
                }, { merge: true });
            } else {
                await db.collection('solicitacoes_acesso').doc(email).set({
                    email: email,
                    nome: name || null,
                    vinculo: type || null,
                    instituicao: institution || null,
                    status: 'pendente',
                    criado_em: admin.firestore.FieldValue.serverTimestamp(),
                    decidido_em: null,
                    decidido_por: null
                }, { merge: true });
            }

            // Usuário comum: bloquear login e informar sobre análise
            if (!isAdmin) {
                return res.status(202).json({
                    pendente: true,
                    message: 'Seu cadastro foi enviado para análise. Aguarde a aprovação do administrador.'
                });
            }
        } else {
            // Fluxo de Login: verificar status no banco (exceto para Admin)
            if (!isAdmin) {
                const userDocRef = db.collection('users').doc(email);
                const userDoc = await userDocRef.get();

                const userStatus = userDoc.exists ? (userDoc.data().status || 'pendente') : 'pendente';

                if (userStatus === 'pendente') {
                    return res.status(403).json({ error: 'Seu cadastro está em análise. Aguarde a aprovação do administrador.' });
                }
                if (userStatus === 'bloqueado') {
                    return res.status(403).json({ error: 'Seu acesso foi revogado. Entre em contato com o administrador.' });
                }
            }

            // Atualiza o heartbeat de último acesso
            await db.collection('users').doc(email).set(userData, { merge: true });
        }

        // 3. Gera um Custom Token no Firebase Auth para ele se logar no front-end
        const customToken = await admin.auth().createCustomToken(email);

        return res.status(200).json({ customToken: customToken });

    } catch (error) {
        console.error("Erro ao verificar token:", error);
        return res.status(500).json({ error: 'Erro interno ao validar o código.' });
    }
};
