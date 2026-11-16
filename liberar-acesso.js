// Script "one-shot" para LIBERAR ACESSO direto (sem passar pela fila de
// solicitacao publica). Cria a conta no Firebase Auth + grava o doc em
// `usuarios/{email}` + gera um link de reset/ativacao de senha pra enviar.
//
// USO: node liberar-acesso.js
//   (edite as constantes EMAIL/NOME/PAPEL/PAINEIS abaixo antes de rodar)
//
// REQUISITO: firebase-key.json na raiz (ja existe pra outros scripts).

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(require('./firebase-key.json'))
});

// ============================================================
// AJUSTE AQUI antes de rodar:
// ============================================================
const EMAIL = 'jdo.josedias@gmail.com';
const NOME = 'CEO';                    // exibido no header e nos logs
const PAPEL = 'usuario';               // 'usuario' = ve tudo, sem aba Admin
                                       // 'admin'   = ve tudo + gerencia outros
const PAINEIS = [
  'GSAAS',
  'SUAC',
  'CGA',
  'CGC',
  'CGC_RESPONSAVEIS',
  'GOOGLE_SHEETS_LINK',
  'FIPLAN_CONSULTA',
];
// ============================================================

const db = admin.firestore();
const auth = admin.auth();

async function main() {
  console.log(`\n>> Liberando acesso para ${EMAIL} (${NOME}) — papel=${PAPEL}`);
  console.log(`>> Paineis: ${PAINEIS.join(', ')}\n`);

  // 1) Cria ou recupera conta no Firebase Auth
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(EMAIL);
    console.log(`(1) Conta JA EXISTE no Firebase Auth — uid=${userRecord.uid}`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      const tempPass = 'TMP_' + Math.random().toString(36).slice(2, 10) + '!aZ1';
      userRecord = await auth.createUser({
        email: EMAIL,
        password: tempPass,
        emailVerified: false,
        displayName: NOME,
      });
      console.log(`(1) Conta CRIADA no Firebase Auth — uid=${userRecord.uid}`);
    } else {
      throw e;
    }
  }

  // 2) Cria ou atualiza doc em usuarios/{email}
  const ref = db.collection('usuarios').doc(EMAIL);
  const snap = await ref.get();
  const payload = {
    email: EMAIL,
    nome: NOME,
    papel: PAPEL,
    ativo: true,
    paineis: PAINEIS,
  };
  if (!snap.exists) {
    payload.criado_em = admin.firestore.FieldValue.serverTimestamp();
  }
  await ref.set(payload, { merge: true });
  console.log(`(2) Doc Firestore ${snap.exists ? 'ATUALIZADO' : 'CRIADO'} — usuarios/${EMAIL}`);

  // 3) Gera link de ativacao (reset de senha) pra ele definir a propria
  const actionLink = await auth.generatePasswordResetLink(EMAIL);
  console.log('\n========================================================');
  console.log('LINK DE ATIVACAO — ENVIE ISTO PRO USUARIO POR WHATSAPP/EMAIL:');
  console.log('========================================================');
  console.log(actionLink);
  console.log('========================================================');
  console.log('Ele abre o link, define a senha, e ja pode logar em:');
  console.log('  https://www.oljr.com.br');
  console.log('========================================================\n');

  process.exit(0);
}

main().catch(e => {
  console.error('\n!! ERRO:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
