const { parentPort, workerData } = require('node:worker_threads');
const { preview } = require('./finance-import');
const { categorizarAutomatico } = require('./finance.controller');
preview(workerData, categorizarAutomatico)
    .then(result => parentPort.postMessage({ result }))
    .catch(error => parentPort.postMessage({ error: error.message }));
