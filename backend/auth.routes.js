const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');

// Rota para solicitar um novo token numérico via e-mail
router.post('/request-token', authController.requestToken);

// Rota para verificar o token digitado e retornar o Custom Token do Firebase
router.post('/verify-token', authController.verifyToken);

module.exports = router;
