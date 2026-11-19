// Sincronização por usuário; sem tokens, conteúdo de extratos ou erros do provedor nos logs.
const admin = require('firebase-admin');
const crypto = require('node:crypto');
const driveApi = require('./finance-google-drive');
const imports = require('./finance-import.controller');
const { hash, validateRows, transactionSignature: signature } = require('./finance-import');
const INTERVAL = 5 * 60 * 1000;
const LEASE = 10 * 60 * 1000;
const READER_VERSION = 2;
const authorized = user => Boolean(user?.ativo && user.paineis?.includes('FINANCE') &&
    !(user.papel === 'convidado' && user.expira_em && Date.now() > new Date(user.expira_em).getTime()));


function classify(preview) {
    const valid = [], pending = [];
    const ids = new Set();
    if (preview.automaticIssues || preview.conferencia?.linhas_divergentes?.length) {
        return { valid, pending: preview.rows, reason: 'Há linhas não reconhecidas ou saldo divergente. Confira este arquivo.' };
    }
    for (const row of preview.rows) {
        if (ids.has(row.sourceId)) return { valid: [], pending: preview.rows, reason: 'Identificadores repetidos entre abas. Confira este arquivo.' };
        ids.add(row.sourceId);
        try { validateRows([row]); valid.push(row); } catch { pending.push(row); }
    }
    return { valid, pending, reason: pending.length ? 'Há movimentos sem data, valor ou direção definidos.' : '' };
}

function createEngine({ db, drive = driveApi, importer = imports, identity = uid => admin.auth().getUser(uid), now = Date.now,
    schedule = work => { const t = setTimeout(work, 1000); t.unref(); } }) {
    const connection = email => db.collection('finance_storage_connections').doc(`${email}__google`);
    async function assertUser(email, uid) {
        const [user, auth] = await Promise.all([db.collection('usuarios').doc(email).get(), identity(uid)]);
        if (!user.exists || !authorized(user.data()) || auth.disabled || auth.email?.toLowerCase() !== email.toLowerCase()) throw new Error('Acesso encerrado');
    }
    async function run(email, uid) {
        const ref = connection(email), lease = crypto.randomUUID();
        await assertUser(email, uid);
        const state = await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref), s = snapshot.exists ? snapshot.data() : null;
            if (!s?.ativo || !s.automacao || s.uid !== uid || !s.pasta_id || s.sync_lease_until > now()) return null;
            tx.update(ref, { sync_lease: lease, sync_lease_until: now() + LEASE }); return s;
        });
        if (!state) return { ocupado: true };
        const guard = async tx => {
            const current = await tx.get(ref), user = await tx.get(db.collection('usuarios').doc(email));
            const s = current.exists ? current.data() : null;
            if (!s?.ativo || !s.automacao || s.uid !== uid || s.revision !== state.revision || s.sync_lease !== lease ||
                s.sync_lease_until < now() || !user.exists || !authorized(user.data())) throw new Error('Conexão alterada');
        };
        let more = false;
        const result = { importadas: 0, duplicadas: 0, pendentes: 0, arquivos: [], erro: null };
        try {
            const access = await drive.access(email);
            const response = await access.drive.files.list({ q: `'${drive.internals.folderId(state.pasta_id)}' in parents and trashed = false`,
                fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)', pageSize: 5,
                pageToken: state.sync_cursor || undefined, orderBy: 'name', supportsAllDrives: true, includeItemsFromAllDrives: true }, { timeout: 15000 });
            for (const file of response.data.files || []) {
                const job = ref.collection('sync_arquivos').doc(hash(JSON.stringify([state.pasta_id, state.conta_id, state.cartao_id, file.id])));
                const previous = await job.get();
                if (previous.exists && previous.data().versao === file.modifiedTime && previous.data().revision === state.revision && previous.data().estado !== 'erro' &&
                    !(previous.data().estado === 'pendente' && previous.data().leitor !== READER_VERSION)) continue;
                const outcome = { file_id: file.id, nome: String(file.name || '').slice(0, 200), versao: file.modifiedTime || null,
                    revision: state.revision, leitor: READER_VERSION, estado: 'concluido', importadas: 0, duplicadas: 0, pendentes: 0, motivo: '' };
                try {
                    if (!drive.internals.supported(file)) {
                        outcome.estado = 'ignorado'; outcome.motivo = 'Use OFX, XLSX, CSV ou PDF de até 3 MB, diretamente nesta pasta.';
                    } else {
                        const source = await drive.download(email, uid, file.id);
                        const preview = await importer.readPreview({ ...source, automatico: true });
                        const classified = classify(preview);
                        // Atualizações podem acrescentar movimentos, mas não podem duplicar correções ou exclusões.
                        const oldFile = await db.collection('finance_lancamentos').where('email', '==', email).where('drive_file_id', '==', file.id).get();
                        const currentRows = new Map(preview.rows.map(r => [r.sourceId, r]));
                        let changedHistory = false;
                        oldFile.forEach(doc => {
                            const old = doc.data();
                            if ((old.conta_id || null) !== state.conta_id || (old.cartao_id || null) !== state.cartao_id) return;
                            const current = currentRows.get(old.import_source_id);
                            if (!current || signature(current) !== signature(old)) changedHistory = true;
                        });
                        if (changedHistory) {
                            classified.valid = []; classified.pending = preview.rows;
                            classified.reason = 'Este arquivo alterou ou removeu movimentos já lançados. Confira as diferenças; os lançamentos anteriores foram preservados.';
                        }
                        outcome.pendentes = classified.pending.length;
                        if (!outcome.pendentes && (preview.automaticIssues || preview.conferencia?.linhas_divergentes?.length)) outcome.pendentes = 1;
                        outcome.motivo = classified.reason;
                        if (!preview.rows.length && !preview.saldos?.length) { outcome.pendentes = 1; outcome.motivo = 'Não encontramos movimentos com estrutura reconhecida.'; }
                        // Coincidências com outra origem exigem análise, sem apagar nem fundir movimentos legítimos.
                        const dates = [...new Set(classified.valid.map(r => r.data))];
                        const existing = [];
                        for (let d = 0; d < dates.length; d += 30) {
                            const matches = await db.collection('finance_lancamentos').where('email', '==', email)
                                .where('data', 'in', dates.slice(d, d + 30)).get();
                            matches.forEach(doc => existing.push(doc));
                        }
                        const collisions = new Set();
                        existing.forEach(doc => {
                            const r = doc.data();
                            if ((r.conta_id || null) === state.conta_id && (r.cartao_id || null) === state.cartao_id &&
                                !(r.origem === preview.formato && classified.valid.some(v => v.sourceId === r.import_source_id))) collisions.add(signature(r));
                        });
                        const safe = classified.valid.filter(row => {
                            if (!collisions.has(signature(row))) return true;
                            outcome.pendentes++; outcome.motivo = 'Possível repetição de outra origem. Confira antes de lançar.'; return false;
                        });
                        for (let i = 0; i < safe.length; i += 400) {
                            await assertUser(email, uid);
                            const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
                            await importer.confirmar({ user: { email }, firebaseUid: uid,
                                automaticGuard: { revision: state.revision, lease },
                                body: { conta_id: state.conta_id, cartao_id: state.cartao_id, formato: preview.formato,
                                    drive: source.drive, lancamentos: safe.slice(i, i + 400) } }, res);
                            if (res.code !== 200 || !res.body?.ok) throw new Error('Gravação não concluída');
                            outcome.importadas += res.body.importadas; outcome.duplicadas += res.body.duplicadas;
                        }
                        if (outcome.pendentes) outcome.estado = 'pendente';
                    }
                } catch {
                    outcome.estado = 'erro'; outcome.motivo = 'Não foi possível concluir a leitura. Confira o formato e a conexão. A próxima sincronização tentará novamente.';
                }
                await db.runTransaction(async tx => { await guard(tx); tx.set(job, { ...outcome, atualizado_em: now() }); });
                result.importadas += outcome.importadas; result.duplicadas += outcome.duplicadas; result.pendentes += outcome.pendentes;
                result.arquivos.push(outcome);
            }
            await db.runTransaction(async tx => { await guard(tx); tx.update(ref, { sync_cursor: response.data.nextPageToken || null }); });
            more = Boolean(response.data.nextPageToken);
        } catch {
            result.erro = 'Sincronização interrompida. Confira a conexão Google. Lotes já concluídos foram preservados; a próxima tentativa não repete a mesma origem.';
            // Cursor expirado ou inválido: recomeça a enumeração sem repetir lançamentos.
            await db.runTransaction(async tx => { await guard(tx); tx.update(ref, { sync_cursor: null }); }).catch(() => {});
        } finally {
            await db.runTransaction(async tx => {
                const snapshot = await tx.get(ref), s = snapshot.exists ? snapshot.data() : null;
                if (s?.sync_lease === lease && s.revision === state.revision) tx.update(ref, {
                    sync_lease_until: 0, sync_lease: null, ultima_execucao: now(),
                    sync_resultado: result.arquivos.length || result.erro ? result : s.sync_resultado || result,
                });
            });
        }
        if (more && !result.erro) schedule(() => { void run(email, uid).catch(() => {}); });
        return result;
    }
    return { run, assertUser };
}

exports.configure = async (req, res) => {
    try {
        const db = admin.firestore(), engine = createEngine({ db });
        await engine.assertUser(req.user.email, req.firebaseUid);
        const { ref, data } = await driveApi.access(req.user.email);
        if (data.uid !== req.firebaseUid || !data.pasta_id) throw new Error('Escolha uma pasta');
        const conta = String(req.body.conta_id || ''), cartao = String(req.body.cartao_id || '');
        const enabled = req.body.ativo === true;
        if (enabled && (Boolean(conta) === Boolean(cartao) || /\//.test(conta + cartao))) throw new Error('Destino inválido');
        await db.runTransaction(async tx => {
            const current = await tx.get(ref);
            if (!current.exists || !current.data().ativo || current.data().revision !== data.revision) throw new Error('Conexão mudou');
            if (enabled) {
                const target = await tx.get(db.collection(conta ? 'finance_contas' : 'finance_cartoes').doc(conta || cartao));
                if (!target.exists || target.data().email !== req.user.email) throw new Error('Destino inválido');
            }
            tx.update(ref, { automacao: enabled, conta_id: enabled ? conta || null : data.conta_id || null,
                cartao_id: enabled ? cartao || null : data.cartao_id || null, revision: data.revision + 1,
                sync_cursor: null, sync_lease: null, sync_lease_until: 0, sync_resultado: null });
        });
        res.json({ ok: true });
        if (enabled) void engine.run(req.user.email, req.firebaseUid).catch(() => {});
    } catch { res.status(400).json({ error: 'Escolha uma pasta e uma conta ou cartão deste Finance. Se a conexão mudou, atualize a tela.' }); }
};
exports.runNow = async (req, res) => {
    try {
        const db = admin.firestore(), snapshot = await db.collection('finance_storage_connections').doc(`${req.user.email}__google`).get();
        if (!snapshot.exists || snapshot.data().uid !== req.firebaseUid || !snapshot.data().automacao) return res.status(409).json({ error: 'Ative a sincronização para esta conta e pasta.' });
        res.status(202).json({ ok: true });
        void createEngine({ db }).run(req.user.email, req.firebaseUid).catch(() => {});
    } catch { res.status(503).json({ error: 'Não foi possível iniciar a sincronização.' }); }
};
exports.pending = async (req, res) => {
    try {
        const { ref, data } = await driveApi.access(req.user.email);
        if (data.uid !== req.firebaseUid) return res.status(409).json({ error: 'Reconecte o Google Drive.' });
        const results = await Promise.all(['pendente', 'erro', 'ignorado'].map(estado => ref.collection('sync_arquivos')
            .where('revision', '==', data.revision).where('estado', '==', estado).limit(100).get()));
        res.json({ arquivos: results.flatMap(r => r.docs.map(d => d.data())), mais: results.some(r => r.size === 100) });
    } catch { res.status(503).json({ error: 'Não foi possível consultar as pendências.' }); }
};
exports.resolve = async (req, res) => {
    try {
        const { ref, data } = await driveApi.access(req.user.email);
        if (data.uid !== req.firebaseUid) throw new Error('Identidade diferente');
        const file = String(req.body.file_id || '');
        if (!/^[a-zA-Z0-9_-]{8,200}$/.test(file)) throw new Error('Arquivo inválido');
        const job = ref.collection('sync_arquivos').doc(hash(JSON.stringify([data.pasta_id, data.conta_id, data.cartao_id, file])));
        await admin.firestore().runTransaction(async tx => {
            const current = await tx.get(ref), saved = await tx.get(job);
            if (!current.exists || !current.data().ativo || current.data().revision !== data.revision || !saved.exists || saved.data().revision !== data.revision) throw new Error('Conexão alterada');
            tx.update(job, { estado: 'resolvido', atualizado_em: Date.now() });
        });
        res.json({ ok: true });
    } catch { res.status(409).json({ error: 'Não foi possível encerrar a pendência. Atualize a tela.' }); }
};
let started = false;
exports.start = () => {
    if (started) return;
    started = true;
    let running = false, cursor;
    const tick = async () => {
        if (running || !driveApi.internals.configured()) return;
        running = true;
        try {
            const db = admin.firestore();
            let query = db.collection('finance_storage_connections').where('automacao', '==', true).orderBy(admin.firestore.FieldPath.documentId()).limit(10);
            if (cursor) query = query.startAfter(cursor);
            const page = await query.get();
            cursor = page.size === 10 ? page.docs[page.docs.length - 1] : undefined;
            const engine = createEngine({ db });
            for (const doc of page.docs) { const s = doc.data(); if (s.provider === 'google' && s.ativo) await engine.run(s.email, s.uid).catch(() => {}); }
        } catch { /* Mantém a próxima tentativa; nenhum dado financeiro ou token vai ao log. */ }
        finally { running = false; }
    };
    const timer = setInterval(() => void tick(), INTERVAL); timer.unref();
    const initial = setTimeout(() => void tick(), 15000); initial.unref();
};
exports.internals = { createEngine, classify, signature, authorized };
