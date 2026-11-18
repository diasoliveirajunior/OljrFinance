const express = require('express');
const router = express.Router();
const { requireAuth, requirePanel } = require('./rbac');
const ctrl = require('./finance.controller');
const contasCtrl = require('./finance-contas.controller');
const cartoesCtrl = require('./finance-cartoes.controller');
const investCtrl = require('./finance-investimentos.controller');
const driveCtrl = require('./finance-drive.controller');
const storageCtrl = require('./finance-storage.controller');
const importCtrl = require('./finance-import.controller');
const rateLimit = require('express-rate-limit');

// Retorno publico; a identidade e validada pelo state OAuth assinado.
router.get('/storage/callback/:provider', storageCtrl.callback);

// Tudo aqui exige login + painel FINANCE atribuido.
router.use(requireAuth, requirePanel('FINANCE'));

// Lancamentos
router.get('/lancamentos', ctrl.listarLancamentos);
router.post('/lancamentos', ctrl.adicionarLancamento);
router.delete('/lancamentos/:id', ctrl.removerLancamento);

// Resumos e series
router.get('/resumo', ctrl.resumo);
router.get('/serie-mensal', ctrl.serieMensal);
router.get('/categorias-mes', ctrl.categoriasMes);
router.get('/patrimonio', investCtrl.patrimonio);
router.get('/combustivel', ctrl.combustivel);

// Orcamento
router.get('/orcamento', ctrl.listarOrcamento);
router.post('/orcamento', ctrl.salvarOrcamento);

// Preferencias
router.get('/preferencias', ctrl.preferencias);
router.put('/preferencias', ctrl.salvarPreferencias);

// Contas bancarias
router.get('/contas', contasCtrl.listar);
router.post('/contas', contasCtrl.criar);
router.put('/contas/:id', contasCtrl.atualizar);
router.delete('/contas/:id', contasCtrl.remover);

// Cartoes de credito
router.get('/cartoes', cartoesCtrl.listar);
router.post('/cartoes', cartoesCtrl.criar);
router.put('/cartoes/:id', cartoesCtrl.atualizar);
router.delete('/cartoes/:id', cartoesCtrl.remover);

// Investimentos
router.get('/investimentos', investCtrl.listar);
router.post('/investimentos', investCtrl.criar);
router.put('/investimentos/:id', investCtrl.atualizar);
router.delete('/investimentos/:id', investCtrl.remover);

// Importacao e sync
router.post('/importar-ofx', ctrl.importarOfx);
router.post('/importacao/previa', rateLimit({ windowMs: 60000, limit: 10,
    message: { error: 'Aguarde um minuto antes de ler outro arquivo.' } }), importCtrl.previa);
router.post('/importacao/confirmar', importCtrl.confirmar);
router.get('/drive/status', driveCtrl.statusDrive);
router.post('/drive/sincronizar', driveCtrl.sincronizarDrive);
router.get('/storage/status', storageCtrl.status);
router.post('/storage/connect/:provider', storageCtrl.start);
router.delete('/storage/connect/:provider', storageCtrl.disconnect);

module.exports = router;
