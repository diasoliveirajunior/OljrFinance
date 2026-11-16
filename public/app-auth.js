import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAze2Xj1H7QhZCz2z_ktR5b1qspbY9NPiI",
  authDomain: "oliveirajunior-eca87.firebaseapp.com",
  projectId: "oliveirajunior-eca87",
  storageBucket: "oliveirajunior-eca87.firebasestorage.app",
  messagingSenderId: "308166224942",
  appId: "1:308166224942:web:46ec1026ea8c7d0d79c3bf",
  measurementId: "G-B1XC8J0BSF"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ==========================================
// CONFIGURAÇÕES DE SEGURANÇA
// ==========================================

const ADMIN_EMAIL = 'diasoliveirajunior@gmail.com';
const MAX_ATTEMPTS = 5;          // tentativas antes do bloqueio
const LOCKOUT_MINUTES = 15;      // duração do bloqueio em minutos
const CAPTCHA_AFTER = 3;         // falhas antes de exibir captcha
const WINDOW_MINUTES = 30;       // janela de tempo para contar tentativas

// ==========================================
// RATE LIMITING — localStorage
// ==========================================

function getSecData() {
    try {
        return JSON.parse(localStorage.getItem('_sec_login') || '{"attempts":[],"lockUntil":0}');
    } catch { return { attempts: [], lockUntil: 0 }; }
}

function saveSecData(data) {
    try { localStorage.setItem('_sec_login', JSON.stringify(data)); } catch {}
}

function isLockedOut() {
    const data = getSecData();
    return (data.lockUntil && Date.now() < data.lockUntil) ? data.lockUntil : false;
}

function getRecentFailures() {
    const data = getSecData();
    const windowMs = WINDOW_MINUTES * 60 * 1000;
    return data.attempts.filter(a => !a.success && (Date.now() - a.time) < windowMs);
}

function recordAttempt(email, success) {
    const data = getSecData();
    const masked = email.substring(0, 3) + '***';
    data.attempts.push({ time: Date.now(), email: masked, success });
    if (data.attempts.length > 100) data.attempts = data.attempts.slice(-100);

    if (!success) {
        const recentFails = data.attempts.filter(
            a => !a.success && (Date.now() - a.time) < WINDOW_MINUTES * 60 * 1000
        );
        if (recentFails.length >= MAX_ATTEMPTS) {
            data.lockUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
            logSuspicious('lockout_triggered', email);
        }
    } else {
        data.lockUntil = 0;
    }
    saveSecData(data);
}

// ==========================================
// LOG DE TENTATIVAS SUSPEITAS
// ==========================================

function logSuspicious(type, email) {
    try {
        const logs = JSON.parse(localStorage.getItem('_sec_suspicious') || '[]');
        logs.push({
            time: new Date().toISOString(),
            type,
            email: email.substring(0, 3) + '***',
            ua: navigator.userAgent.substring(0, 80)
        });
        if (logs.length > 200) logs.shift();
        localStorage.setItem('_sec_suspicious', JSON.stringify(logs));
        console.warn('[SECURITY]', type, '—', new Date().toISOString());
    } catch {}
}

// Exporta logs para console (útil para o admin)
window._adminGetSecLogs = () => {
    if (auth.currentUser?.email !== ADMIN_EMAIL) return 'Acesso negado.';
    try { return JSON.parse(localStorage.getItem('_sec_suspicious') || '[]'); } catch { return []; }
};

// ==========================================
// CAPTCHA MATEMÁTICO
// ==========================================

let _captchaAnswer = null;

function generateCaptcha() {
    const a = Math.floor(Math.random() * 12) + 1;
    const b = Math.floor(Math.random() * 12) + 1;
    _captchaAnswer = a + b;
    const q = document.getElementById('captcha-question');
    const input = document.getElementById('captcha-answer');
    if (q) q.textContent = `Verificação de segurança: quanto é ${a} + ${b}?`;
    if (input) input.value = '';
}

function showCaptcha() {
    const el = document.getElementById('login-captcha');
    if (el && !el.classList.contains('show')) {
        el.classList.add('show');
        generateCaptcha();
    }
}

function hideCaptcha() {
    const el = document.getElementById('login-captcha');
    if (el) el.classList.remove('show');
    _captchaAnswer = null;
}

function verifyCaptcha() {
    const el = document.getElementById('login-captcha');
    if (!el || !el.classList.contains('show')) return true;
    const val = parseInt(document.getElementById('captcha-answer').value, 10);
    return val === _captchaAnswer;
}

// ==========================================
// MENSAGENS NA UI
// ==========================================

function showMsg(id, text, type = 'error') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `security-message ${type} show`;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideMsg(id) {
    const el = document.getElementById(id);
    if (el) el.className = 'security-message';
}

let _countdownTimer = null;

function startLockoutCountdown(lockUntil) {
    if (_countdownTimer) clearInterval(_countdownTimer);
    const update = () => {
        const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
        if (remaining <= 0) {
            clearInterval(_countdownTimer);
            hideMsg('login-message');
            hideCaptcha();
            setLoginEnabled(true);
            return;
        }
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        showMsg('login-message',
            `Acesso bloqueado por excesso de tentativas. Aguarde ${m}m ${s < 10 ? '0' : ''}${s}s.`,
            'warning');
        setLoginEnabled(false);
    };
    update();
    _countdownTimer = setInterval(update, 1000);
}

function setLoginEnabled(enabled) {
    const btn = document.getElementById('btn-login-submit');
    const emailInput = document.getElementById('login-email');
    if (btn) btn.disabled = !enabled;
    if (emailInput) emailInput.disabled = !enabled;
}



// ==========================================
// LÓGICA DE INTERFACE (MODAL E FORMULÁRIOS)
// ==========================================

const modal = document.getElementById('auth-modal');
const btnClose = document.getElementById('modal-close');
const btnOpenLogin = document.getElementById('btn-open-login');
const btnTopLogin = document.getElementById('btn-top-login');
const formLogin = document.getElementById('form-login');
const formSignup = document.getElementById('form-signup');
const linkToSignup = document.getElementById('link-to-signup');
const btnBackToLogin = document.getElementById('btn-back-to-login');

function openModal() {
    modal.classList.add('active');
    activateForm('login');
    checkLockoutState();
}

function closeModal() {
    modal.classList.remove('active');
    hideMsg('login-message');
    hideMsg('signup-message');
}

function checkLockoutState() {
    const lockUntil = isLockedOut();
    if (lockUntil) {
        startLockoutCountdown(lockUntil);
    } else {
        setLoginEnabled(true);
        if (getRecentFailures().length >= CAPTCHA_AFTER) showCaptcha();
    }
}

if (btnOpenLogin) btnOpenLogin.addEventListener('click', openModal);
if (btnTopLogin)  btnTopLogin.addEventListener('click', openModal);
btnClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

function activateForm(name) {
    formLogin.classList.toggle('active', name === 'login');
    formSignup.classList.toggle('active', name === 'signup');
}

if (linkToSignup)   linkToSignup.addEventListener('click',   (e) => { e.preventDefault(); activateForm('signup'); });
if (btnBackToLogin) btnBackToLogin.addEventListener('click', (e) => { e.preventDefault(); activateForm('login');  });

// Se a URL tem ?vinculo=X (ex.: convite por e-mail), abre o modal de cadastro com
// o vínculo pré-selecionado e dispara o change p/ ajustar os campos condicionais.
(function preselectVinculoFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const v = params.get('vinculo');
        if (!v) return;
        const select = document.getElementById('signup-type');
        if (!select) return;
        const opt = Array.from(select.options).find(o => o.value === v);
        if (!opt) return;
        select.value = v;
        select.dispatchEvent(new Event('change'));
        openModal();
        activateForm('signup');
    } catch (_) { /* falha silenciosa */ }
})();

// Lógica do Formulário Inteligente (Vínculo)
const signupTypeSelect    = document.getElementById('signup-type');
const groupPublicSector   = document.getElementById('group-public-sector');
const groupPrivateSector  = document.getElementById('group-private-sector');
const inputPublicSector   = document.getElementById('signup-public-sector');
const inputPrivateSector  = document.getElementById('signup-private-sector');

signupTypeSelect.addEventListener('change', (e) => {
    const value = e.target.value;
    const isPublic  = value === 'publico';
    const isPrivate = value === 'privado';
    const isParticular = value === 'particular';
    
    groupPublicSector.classList.toggle('hidden-field', !isPublic);
    groupPrivateSector.classList.toggle('hidden-field', !isPrivate);
    inputPublicSector.required  = isPublic;
    inputPrivateSector.required = isPrivate;
    
    if (!isPublic)  inputPublicSector.value  = '';
    if (!isPrivate) inputPrivateSector.value = '';

    // Dynamic Email Placeholder
    const emailInput = document.getElementById('signup-email');
    if (isPublic) {
        emailInput.placeholder = 'seu.nome@orgao.mt.gov.br';
    } else if (isPrivate) {
        emailInput.placeholder = 'seu.nome@empresa.com.br';
    } else {
        emailInput.placeholder = 'seu@email.com';
    }
});



// ==========================================
// FIREBASE — LOGIN
// ==========================================

let currentLoginEmail = '';

// Esqueceu a Senha
const linkForgotPassword = document.getElementById('link-forgot-password');
if (linkForgotPassword) {
    linkForgotPassword.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        if (!email) {
            showMsg('login-message', 'Por favor, digite seu e-mail acima antes de clicar em "Esqueci minha senha".', 'warning');
            return;
        }
        
        try {
            showMsg('login-message', 'Enviando e-mail de redefinição...', 'warning');
            await sendPasswordResetEmail(auth, email);
            showMsg('login-message', 'E-mail enviado! Verifique sua caixa de entrada para criar uma nova senha.', 'success');
        } catch (error) {
            let msg = 'Erro ao enviar e-mail. Tente novamente.';
            if (error.code === 'auth/user-not-found') msg = 'E-mail não encontrado no sistema.';
            showMsg('login-message', msg, 'error');
        }
    });
}

formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg('login-message');

    const email = document.getElementById('login-email').value.trim();
    const passwordInput = document.getElementById('login-token');
    const submitBtn = document.getElementById('btn-login-submit');

    const password = passwordInput.value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';

    try {
        // Log in nativo no Firebase com Email e Senha
        await signInWithEmailAndPassword(auth, email, password);

        showMsg('login-message', 'Acesso liberado! Redirecionando...', 'success');
        setTimeout(() => {
            window.location.href = '/portal';
        }, 1500);
        
    } catch (error) {
        let errorMsg = 'Senha ou e-mail inválidos.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMsg = 'Senha ou e-mail inválidos.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg = 'Muitas tentativas falhas. Tente novamente mais tarde.';
        }
        showMsg('login-message', errorMsg, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Entrar';
        recordAttempt(email, false); // registra falha
    }
});

// ==========================================
// FIREBASE — CADASTRO
// ==========================================

let currentSignupEmail = '';

formSignup.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg('signup-message');

    const name            = document.getElementById('signup-name').value.trim();
    const email           = document.getElementById('signup-email').value.trim();
    const type            = document.getElementById('signup-type').value;
    const tokenInput      = document.getElementById('signup-token');
    const tokenGroup      = document.getElementById('signup-token-group');
    const submitBtn       = document.getElementById('btn-signup-submit');

    // Validação de vínculo (CEO, Equipe OlJr, Empresa Privada, Particular) é feita no backend
    // via prelista. Front só faz checks de campo obrigatório.

    let institution = '';
    if (type === 'publico')  institution = document.getElementById('signup-public-sector').value;
    if (type === 'privado') institution = document.getElementById('signup-private-sector').value;
    if (type === 'ceo') institution = 'OlJr';
    if (type === 'particular') institution = 'Particular';

    // Passo 1: Solicitar Token
    if (tokenGroup.classList.contains('hidden-field')) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
        
        try {
            const res = await fetch('/api/auth/request-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // type vai junto p/ o backend rejeitar vínculo restrito SEM enviar e-mail.
                body: JSON.stringify({ email, type })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Erro ao enviar código.');
            
            showMsg('signup-message', 'Código de 6 dígitos enviado para o seu e-mail!', 'success');
            currentSignupEmail = email;
            tokenGroup.classList.remove('hidden-field');
            tokenInput.required = true;
            document.getElementById('signup-email').disabled = true;
            submitBtn.textContent = 'Validar Código';
            submitBtn.disabled = false;
        } catch (error) {
            showMsg('signup-message', error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Cadastrar';
        }
        return;
    }

    // Passo 2: Verificar Token e Cadastrar no Firestore
    const token = tokenInput.value.trim();
    if (token.length !== 6) {
        showMsg('signup-message', 'O código deve ter 6 dígitos.', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';

    try {
        const res = await fetch('/api/auth/verify-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentSignupEmail, token, name, type, institution }) 
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Código inválido ou expirado.');

        // Cadastro pendente de aprovação (202 — usuário comum)
        if (data.pendente) {
            showMsg('signup-message', data.message || 'Seu cadastro está em análise. Aguarde a aprovação do administrador.', 'warning');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Cadastrar';
            return;
        }

        // Log in nativo no Firebase com Custom Token (apenas Admin chega aqui no cadastro)
        await signInWithCustomToken(auth, data.customToken);

        showMsg('signup-message', 'Conta criada com sucesso! Redirecionando...', 'success');
        setTimeout(() => {
            window.location.href = '/admin.html';
        }, 1500);
        
    } catch (error) {
        showMsg('signup-message', error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Validar Código';
    }
});
