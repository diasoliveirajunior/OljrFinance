// Notificacoes do admin quando algo importante acontece (solicitacoes de
// acesso, alertas operacionais). Roda async em background, fail-silent
// (nao quebra a request que disparou).

const nodemailer = require('nodemailer');
const { ADMIN_EMAIL } = require('./rbac');

let _transporter = null;
function getTransporter() {
    if (!_transporter) {
        _transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
        });
    }
    return _transporter;
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
}

async function sendEmailToAdmin(subject, html) {
    if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
        console.log('[notify-email] SMTP_EMAIL/SMTP_PASSWORD nao configurados — pulando');
        return { skipped: true };
    }
    await getTransporter().sendMail({
        from: process.env.SMTP_EMAIL,
        to: ADMIN_EMAIL,
        subject,
        html
    });
    return { ok: true };
}

// ============================================================================
// WHATSAPP — placeholder pra API paga (Twilio / Meta Cloud API / Z-API).
// Quando contratar, implementar sendWhatsappToAdmin(texto) aqui e adicionar
// a chamada em notifyNewAccessRequest. Manter o padrao fail-silent (retornar
// { skipped: true } quando nao configurado, capturar erros e logar).
// ============================================================================

// Notifica o admin sobre uma nova solicitacao de acesso ao portal.
// Roda async em background — chamadora nao espera resposta.
async function notifyNewAccessRequest(payload) {
    const { email, nome, vinculo, instituicao, mensagem } = payload || {};
    const subject = `[OLJR Portal] Nova solicitacao de acesso: ${nome || email}`;
    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 560px;">
  <h2 style="color: #0F6E56; margin: 0 0 12px;">Nova solicitacao de acesso</h2>
  <p style="color: #555; margin: 0 0 16px;">Uma pessoa pediu acesso ao Portal OLJR Analytics.</p>
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr><td style="padding: 6px 12px 6px 0; color: #888; font-size: 13px;"><b>Nome:</b></td><td style="padding: 6px 0; font-size: 13px;">${escapeHtml(nome)}</td></tr>
    <tr><td style="padding: 6px 12px 6px 0; color: #888; font-size: 13px;"><b>E-mail:</b></td><td style="padding: 6px 0; font-size: 13px;">${escapeHtml(email)}</td></tr>
    <tr><td style="padding: 6px 12px 6px 0; color: #888; font-size: 13px;"><b>Vinculo:</b></td><td style="padding: 6px 0; font-size: 13px;">${escapeHtml(vinculo || '—')}</td></tr>
    <tr><td style="padding: 6px 12px 6px 0; color: #888; font-size: 13px;"><b>Instituicao:</b></td><td style="padding: 6px 0; font-size: 13px;">${escapeHtml(instituicao || '—')}</td></tr>
    ${mensagem ? `<tr><td style="padding: 6px 12px 6px 0; color: #888; font-size: 13px; vertical-align: top;"><b>Mensagem:</b></td><td style="padding: 6px 0; font-size: 13px; white-space: pre-wrap;">${escapeHtml(mensagem)}</td></tr>` : ''}
  </table>
  <a href="https://www.oljr.com.br/portal/admin" style="display: inline-block; background: #0F6E56; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 13px;">Aprovar ou rejeitar →</a>
  <p style="color: #888; font-size: 11px; margin: 24px 0 0;">E-mail automatico do Portal OLJR. Nao responda.</p>
</div>`;

    try {
        const r = await sendEmailToAdmin(subject, html);
        if (r.skipped) console.log('[notify-access email] pulado (SMTP nao configurado)');
        else console.log('[notify-access email] enviado');
    } catch (e) {
        console.error('[notify-access email] erro:', e?.message || e);
    }
}

module.exports = { notifyNewAccessRequest, sendEmailToAdmin };
