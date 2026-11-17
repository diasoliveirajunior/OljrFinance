require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const admin = require('firebase-admin');

// 1. Inicializa o Firebase Admin SDK usando a chave de serviço
// Em produção (Azure App Service) usa a env var FIREBASE_KEY_JSON.
// Em dev local, fallback para firebase-key.json na raiz (NÃO commitar — está no .gitignore).
let serviceAccount;
if (process.env.FIREBASE_KEY_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin SDK inicializado via ENV.");
    } catch (error) {
        console.error("ERRO ao carregar Firebase via ENV:", error.message);
    }
} else {
    try {
        serviceAccount = require('./firebase-key.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin SDK inicializado via arquivo.");
    } catch (error) {
        console.error("ERRO: firebase-key.json não encontrado. O servidor não conseguirá autenticar requisições.");
    }
}

const app = express();
const port = process.env.PORT || 8080;

// Atrás de proxy reverso (Azure App Service) — necessário para rate-limit/IP detection.
app.set('trust proxy', 1);

// 2a. Helmet — security headers (HSTS, X-Frame-Options, X-Content-Type-Options, etc).
// CSP customizada para permitir Firebase, CDNs usadas pelo front e inline scripts existentes nos HTMLs.
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "default-src": ["'self'"],
            "script-src": [
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                "https://www.gstatic.com",
                "https://www.googleapis.com",
                "https://apis.google.com",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com"
            ],
            "style-src": [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://cdn.jsdelivr.net"
            ],
            "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
            "img-src": ["'self'", "data:", "https:", "blob:"],
            "connect-src": [
                "'self'",
                "https://*.googleapis.com",
                "https://*.firebaseio.com",
                "https://*.firebaseapp.com",
                "https://identitytoolkit.googleapis.com",
                "https://securetoken.googleapis.com",
                "https://firestore.googleapis.com"
            ],
            "frame-src": ["'self'", "https://*.firebaseapp.com", "https://accounts.google.com"],
            "object-src": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false, // Firebase Auth quebra com COEP estrito
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" } // popups do Google Sign-In
}));

// 2b. CORS — whitelist OljrFinance (host dedicado + dev local).
const allowedOrigins = [
    'https://finance.oljr.com.br',
    'https://oljr-finance.azurewebsites.net',
    'http://localhost:8080',
    'http://localhost:5173', // Vite dev (portal React)
    'http://127.0.0.1:8080',
    'http://127.0.0.1:5173'
];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin não permitido pelo CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: '6mb' })); // limite contra payload bomb (5mb OFX + folga)

// Health Check do Azure: raso, sem dependências externas.
app.get('/healthz', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'oljr-finance',
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

// 2c. Rate limiting global em /api/* (brute-force / scraping).
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições, tente novamente em alguns minutos.' }
});
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde alguns minutos.' }
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', strictLimiter);
app.use('/api/access/', strictLimiter);

// 3a. Servir o portal React (build do Vite) em /portal/* com fallback SPA.
// Arquivos de /assets/* tem hash no nome e podem ficar cacheados agressivo.
// index.html NAO pode cachear — caso contrario o browser continua usando
// HTML velho apontando pra assets antigos depois de deploy novo.
const portalDist = path.join(__dirname, 'portal', 'dist');
app.use('/portal/assets', express.static(path.join(portalDist, 'assets'), {
    maxAge: '1y',
    immutable: true,
}));
app.use('/portal', express.static(portalDist, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, must-revalidate');
        }
    }
}));
app.get(/^\/portal(\/.*)?$/, (req, res) => {
    res.set('Cache-Control', 'no-store, must-revalidate');
    res.sendFile(path.join(portalDist, 'index.html'));
});

// 3b. Raiz redireciona pro portal React — nao servimos mais public/index.html
// legado do OljrSite. Toda tela do Finance esta dentro do /portal (Vite build).
app.get('/', (req, res) => res.redirect(302, '/portal/'));

// 4. Rotas da API — Finance + Auth/Access/RBAC/Admin compartilhado.
const authRoutes = require('./backend/auth.routes');
const adminRoutes = require('./backend/admin.routes');
const rbacRoutes = require('./backend/rbac.routes');
const accessRoutes = require('./backend/access.routes');
const financeRoutes = require('./backend/finance.routes');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rbac', rbacRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/finance', financeRoutes);

// Fallback: /api/* 404 JSON; qualquer outra rota redireciona pro portal.
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `Rota de API não encontrada: ${req.method} ${req.path}` });
    }
    if (/\.[a-zA-Z0-9]{1,8}$/.test(req.path)) {
        return res.status(404).send('Not Found');
    }
    res.redirect(302, '/portal/');
});

// 5. Iniciar Servidor
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Servidor OljrFinance rodando na porta ${port}`);
    });
}

module.exports = app;
