const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const adminController = require('./admin.controller');

const ADMIN_EMAIL = 'diasoliveirajunior@gmail.com';

/**
 * Middleware: Verifica se a requisição vem do administrador.
 * Espera um Firebase ID Token no cabeçalho Authorization: Bearer <token>
 */
async function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação necessário.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        if (decoded.uid !== ADMIN_EMAIL) {
            return res.status(403).json({ error: 'Acesso negado. Apenas o administrador pode realizar esta ação.' });
        }
        req.adminEmail = decoded.uid;
        next();
    } catch (error) {
        console.error('Erro ao verificar token admin:', error);
        return res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
    }
}

// Rotas protegidas — apenas Admin
router.get('/users', requireAdmin, adminController.getUsers);
router.post('/approve-user', requireAdmin, adminController.approveUser);
router.post('/revoke-user', requireAdmin, adminController.revokeUser);

module.exports = router;
