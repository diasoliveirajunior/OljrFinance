const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(require('./firebase-key.json'))
});
const db = admin.firestore();

async function makeAdmin() {
  const email = 'diasoliveirajunior@gmail.com';
  const doc = await db.collection('usuarios').doc(email).get();
  console.log('Before:', doc.data());
  
  await db.collection('usuarios').doc(email).set({
    papel: 'admin',
    status: 'ativo',
    paineis: ['CGC']
  }, { merge: true });
  
  const after = await db.collection('usuarios').doc(email).get();
  console.log('After:', after.data());
  console.log('Done!');
  process.exit(0);
}

makeAdmin();
