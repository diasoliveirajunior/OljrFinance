const express = require('express');
const router = express.Router();
const { requireAuth, requirePanel } = require('./rbac');
const ctrl = require('./finance.controller');
const driveCtrl = require('./finance-drive.controller');
const storageCtrl = require('./finance-storage.controller');

// Retorno público; a identidade é validada pelo state OAuth assinado.
router.get('/storage/callback/:provider', storageCtrl.callback);

// Tudo aqui exige login + painel FINANCE atribuído.
router.use(requireAuth, requirePanel('FINANCE'));

router.get('/lancamentos', ctrl.listarLancamentos);
router.post('/lancamentos', ctrl.adicionarLancamento);
router.delete('/lancamentos/:id', ctrl.removerLancamento);
router.get('/resumo', ctrl.resumo);
router.get('/serie-mensal', ctrl.serieMensal);
router.get('/categorias-mes', ctrl.categoriasMes);
router.get('/orcamento', ctrl.listarOrcamento);
router.post('/orcamento', ctrl.salvarOrcamento);
router.get('/preferencias', ctrl.preferencias);
router.put('/preferencias', ctrl.salvarPreferencias);
router.post('/importar-ofx', ctrl.importarOfx);
router.get('/drive/status', driveCtrl.statusDrive);
router.post('/drive/sincronizar', driveCtrl.sincronizarDrive);
router.get('/storage/status', storageCtrl.status);
router.post('/storage/connect/:provider', storageCtrl.start);
router.delete('/storage/connect/:provider', storageCtrl.disconnect);

module.exports = router;
