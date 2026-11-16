const admin = require('firebase-admin');

/**
 * GET /api/admin/users
 * Retorna todos os usuários cadastrados no Firestore.
 */
exports.getUsers = async (req, res) => {
    try {
        const db = admin.firestore();
        const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
        const users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
        return res.status(200).json({ users });
    } catch (error) {
        // Fallback: busca sem ordenação (caso o índice do Firestore não exista ainda)
        try {
            const db = admin.firestore();
            const snapshot = await db.collection('users').get();
            const users = [];
            snapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });
            return res.status(200).json({ users });
        } catch (err) {
            console.error('Erro ao buscar usuários:', err);
            return res.status(500).json({ error: 'Erro interno ao buscar usuários.' });
        }
    }
};

/**
 * POST /api/admin/approve-user
 * Altera o status do usuário para 'aprovado'.
 */
exports.approveUser = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });

        const db = admin.firestore();
        await db.collection('users').doc(email).update({ status: 'aprovado' });
        return res.status(200).json({ message: 'Usuário aprovado com sucesso.' });
    } catch (error) {
        console.error('Erro ao aprovar usuário:', error);
        return res.status(500).json({ error: 'Erro interno ao aprovar usuário.' });
    }
};

/**
 * POST /api/admin/revoke-user
 * Altera o status do usuário para 'bloqueado'.
 */
exports.revokeUser = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });

        const db = admin.firestore();
        await db.collection('users').doc(email).update({ status: 'bloqueado' });
        return res.status(200).json({ message: 'Acesso do usuário revogado.' });
    } catch (error) {
        console.error('Erro ao revogar usuário:', error);
        return res.status(500).json({ error: 'Erro interno ao revogar acesso.' });
    }
};
