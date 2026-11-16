const express = require('express');
const router = express.Router();
const { requireToken } = require('./rbac');
const ctrl = require('./access.controller');

// Pública: a pessoa ainda não tem conta/acesso quando pede.
router.post('/solicitar', ctrl.solicitar);

// Exige só estar logado no Firebase (não exige acesso liberado).
router.get('/me', requireToken, ctrl.me);

module.exports = router;
