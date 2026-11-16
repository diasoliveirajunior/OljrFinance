const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./rbac');
const ctrl = require('./rbac.controller');

// Tudo aqui exige login válido E ser admin (porteiro).
router.use(requireAuth, requireAdmin);

router.get('/solicitacoes', ctrl.listarSolicitacoes);
router.post('/solicitacoes/decidir', ctrl.decidirSolicitacao);
router.get('/usuarios', ctrl.listarUsuarios);
router.post('/usuarios/atualizar', ctrl.atualizarUsuario);
router.post('/usuarios/enviar-senha', ctrl.enviarSenhaUsuario);
router.get('/prelista', ctrl.listarPrelista);
router.post('/prelista/adicionar', ctrl.adicionarPrelista);
router.post('/prelista/remover', ctrl.removerPrelista);
router.post('/prelista/reenviar', ctrl.reenviarConvitePrelista);
router.get('/logs', ctrl.listarLogs);

module.exports = router;
