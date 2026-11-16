const admin = require('firebase-admin');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { google } = require('googleapis');
const { ADMIN_EMAIL } = require('./rbac');
const { categorizarAutomatico } = require('./finance.controller');

const DRIVE_FOLDER_ID = process.env.FINANCE_DRIVE_FOLDER_ID || '1F5xY-aIycbPEZDa6JrWdeRiwJZ56dBDl';
const DRIVE_OWNER_EMAIL = String(process.env.FINANCE_DRIVE_OWNER_EMAIL || ADMIN_EMAIL).toLowerCase();

function getServiceAccount() {
    if (process.env.FIREBASE_KEY_JSON) return JSON.parse(process.env.FIREBASE_KEY_JSON);
    return require('../firebase-key.json');
}

function getDrive() {
    const serviceAccount = getServiceAccount();
    const auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    return {
        drive: google.drive({ version: 'v3', auth }),
        serviceAccountEmail: serviceAccount.client_email
    };
}

function assertOwner(req, res) {
    if (String(req.user.email).toLowerCase() !== DRIVE_OWNER_EMAIL) {
        res.status(403).json({ error: 'Esta pasta bancária está vinculada somente ao titular da conta.' });
        return false;
    }
    return true;
}

function normalizeText(v) {
    return String(v == null ? '' : v).normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(v) {
    return normalizeText(v).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDate(value) {
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const text = normalizeText(value);
    let m = text.match(/^(\d{2})[/. -](\d{2})[/. -](\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseMoney(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    let text = String(value == null ? '' : value).trim();
    if (!text) return null;
    const negative = /(^-|D$|\(|\bDEBITO\b)/i.test(text);
    text = text.replace(/[R$\s()CD]/gi, '').replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.').replace(/[^0-9.-]/g, '');
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    return negative ? -Math.abs(parsed) : parsed;
}

function findColumn(headers, candidates) {
    const normalized = headers.map(normalizeKey);
    for (const candidate of candidates) {
        const index = normalized.findIndex((h) => h === candidate || h.includes(candidate));
        if (index >= 0) return index;
    }
    return -1;
}

function cellValue(value) {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('result' in value) return value.result;
        if ('text' in value) return value.text;
        if (Array.isArray(value.richText)) return value.richText.map((x) => x.text || '').join('');
    }
    return value;
}

async function parseBancoBrasilWorkbook(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const transactions = [];
    for (const worksheet of workbook.worksheets) {
        const sheetName = worksheet.name;
        const rows = [];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            const values = [];
            for (let i = 1; i <= worksheet.columnCount; i++) {
                values.push(cellValue(row.getCell(i).value) ?? '');
            }
            rows[rowNumber - 1] = values;
        });
        let headerIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const keys = (rows[i] || []).map(normalizeKey);
            if (keys.some((x) => x === 'data' || x.includes('datamovimento') || x.includes('dtmovimento')) &&
                keys.some((x) => x === 'valor' || x.includes('valor'))) {
                headerIndex = i;
                break;
            }
        }
        if (headerIndex < 0) continue;
        const headers = rows[headerIndex];
        const dateCol = findColumn(headers, ['data', 'datamovimento', 'dtmovimento', 'datalancamento', 'dtlancamento']);
        const valueCol = findColumn(headers, ['valor', 'valorlancamento']);
        const historyCol = findColumn(headers, ['historico', 'lancamento', 'descricao']);
        const detailCol = findColumn(headers, ['detalhes', 'complemento', 'observacao']);
        const documentCol = findColumn(headers, ['numerodocumento', 'documento', 'doc']);
        const typeCol = findColumn(headers, ['tipo', 'tipolancamento', 'creditodebito']);
        if (dateCol < 0 || valueCol < 0) continue;

        for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex] || [];
            const data = parseDate(row[dateCol]);
            let amount = parseMoney(row[valueCol]);
            if (!data || amount === null || amount === 0) continue;
            const typeText = typeCol >= 0 ? normalizeText(row[typeCol]).toLowerCase() : '';
            if (/debito|^d$/.test(typeText)) amount = -Math.abs(amount);
            if (/credito|^c$/.test(typeText)) amount = Math.abs(amount);
            const parts = [];
            if (historyCol >= 0) parts.push(normalizeText(row[historyCol]));
            if (detailCol >= 0) parts.push(normalizeText(row[detailCol]));
            const descricao = parts.filter(Boolean).join(' — ').slice(0, 200);
            if (!descricao || normalizeKey(descricao).includes('saldo')) continue;
            const documento = documentCol >= 0 ? normalizeText(row[documentCol]) : '';
            const fingerprint = crypto.createHash('sha256')
                .update([data, amount.toFixed(2), descricao, documento].join('|')).digest('hex');
            transactions.push({
                data, descricao, documento: documento || null,
                valor: Math.abs(amount), tipo: amount >= 0 ? 'receita' : 'despesa',
                categoria: categorizarAutomatico(descricao), fingerprint,
                sheetName, rowIndex: rowIndex + 1
            });
        }
    }
    return transactions;
}

async function listXlsxFiles(drive) {
    const files = [];
    let pageToken;
    do {
        const response = await drive.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
            fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum)',
            orderBy: 'name', pageSize: 1000, pageToken,
            supportsAllDrives: true, includeItemsFromAllDrives: true
        });
        files.push(...(response.data.files || []));
        pageToken = response.data.nextPageToken;
    } while (pageToken);
    return files.filter((file) => {
        const isXlsx = /\.xlsx$/i.test(file.name || '') ||
            file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const withinLimit = !file.size || Number(file.size) <= 5 * 1024 * 1024;
        return isXlsx && withinLimit;
    });
}

exports.statusDrive = async (req, res) => {
    if (!assertOwner(req, res)) return;
    try {
        const { drive, serviceAccountEmail } = getDrive();
        const files = await listXlsxFiles(drive);
        const state = await admin.firestore().collection('finance_drive_config').doc(req.user.email).get();
        res.json({
            ok: true, conectado: true, pasta_id: DRIVE_FOLDER_ID,
            pasta_url: `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`,
            conta_google_servico: serviceAccountEmail, arquivos_encontrados: files.length,
            ultima_sincronizacao: state.exists ? state.data().ultima_sincronizacao || null : null,
            ultimo_resultado: state.exists ? state.data().ultimo_resultado || null : null
        });
    } catch (error) {
        let serviceAccountEmail = null;
        try { serviceAccountEmail = getServiceAccount().client_email; } catch (_) {}
        const forbidden = error && (error.code === 403 || error.code === 404);
        res.status(forbidden ? 200 : 500).json({
            error: forbidden ? 'A pasta ainda não foi compartilhada com a conta técnica do portal.'
                : `Erro ao consultar Google Drive: ${error.message}`,
            conectado: false, conta_google_servico: serviceAccountEmail,
            pasta_id: DRIVE_FOLDER_ID,
            pasta_url: `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`
        });
    }
};

exports.sincronizarDrive = async (req, res) => {
    if (!assertOwner(req, res)) return;
    try {
        const email = req.user.email;
        const { drive } = getDrive();
        const files = await listXlsxFiles(drive);
        const db = admin.firestore();
        const existing = await db.collection('finance_lancamentos').where('email', '==', email).get();
        const fingerprints = new Set();
        existing.forEach((doc) => {
            if (doc.data().import_fingerprint) fingerprints.add(doc.data().import_fingerprint);
        });

        let arquivosProcessados = 0, arquivosIgnorados = 0, importadas = 0, duplicadas = 0;
        const erros = [];
        for (const file of files) {
            const registryRef = db.collection('finance_drive_arquivos').doc(file.id);
            const registry = await registryRef.get();
            if (registry.exists && registry.data().modified_time === file.modifiedTime) {
                arquivosIgnorados++;
                continue;
            }
            try {
                const download = await drive.files.get(
                    { fileId: file.id, alt: 'media', supportsAllDrives: true },
                    { responseType: 'arraybuffer' }
                );
                const transactions = await parseBancoBrasilWorkbook(Buffer.from(download.data));
                const batches = [];
                let batch = db.batch();
                let batchCount = 0;
                for (const tx of transactions) {
                    if (fingerprints.has(tx.fingerprint)) {
                        duplicadas++;
                        continue;
                    }
                    const ref = db.collection('finance_lancamentos').doc();
                    batch.set(ref, {
                        email, data: tx.data, descricao: tx.descricao, categoria: tx.categoria,
                        valor: tx.valor, tipo: tx.tipo, origem: 'drive_xlsx',
                        banco: 'Banco do Brasil', documento_bancario: tx.documento,
                        import_fingerprint: tx.fingerprint, drive_file_id: file.id,
                        drive_file_name: file.name, drive_sheet: tx.sheetName,
                        drive_row: tx.rowIndex, criado_em: admin.firestore.FieldValue.serverTimestamp(),
                        criado_por: email
                    });
                    fingerprints.add(tx.fingerprint);
                    importadas++;
                    batchCount++;
                    if (batchCount === 400) {
                        batches.push(batch.commit());
                        batch = db.batch();
                        batchCount = 0;
                    }
                }
                if (batchCount) batches.push(batch.commit());
                await Promise.all(batches);
                await registryRef.set({
                    email, file_id: file.id, file_name: file.name,
                    modified_time: file.modifiedTime, md5: file.md5Checksum || null,
                    transacoes_encontradas: transactions.length,
                    processado_em: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                arquivosProcessados++;
            } catch (error) {
                erros.push({ arquivo: file.name, erro: error.message });
            }
        }
        const result = {
            arquivos_encontrados: files.length, arquivos_processados: arquivosProcessados,
            arquivos_ignorados: arquivosIgnorados, importadas, duplicadas, erros
        };
        await db.collection('finance_drive_config').doc(email).set({
            pasta_id: DRIVE_FOLDER_ID,
            ultima_sincronizacao: admin.firestore.FieldValue.serverTimestamp(),
            ultimo_resultado: result
        }, { merge: true });
        res.json({ ok: true, ...result });
    } catch (error) {
        console.error('finance.sincronizarDrive:', error);
        res.status(500).json({ error: `Erro ao sincronizar Google Drive: ${error.message}` });
    }
};

module.exports.parseBancoBrasilWorkbook = parseBancoBrasilWorkbook;
