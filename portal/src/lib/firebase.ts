import { initializeApp } from "firebase/app"
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from "firebase/auth"

// Config publica do projeto Firebase. apiKey/authDomain/projectId sao
// chaves de cliente (projeto oliveirajunior-eca87) — publicas por design
// do Firebase. A seguranca vem das regras do Firestore + tokens por sessao.
const firebaseConfig = {
  apiKey: "AIzaSyAze2Xj1H7QhZCz2z_ktR5b1qspbY9NPiI",
  authDomain: "oliveirajunior-eca87.firebaseapp.com",
  projectId: "oliveirajunior-eca87",
  storageBucket: "oliveirajunior-eca87.firebasestorage.app",
  messagingSenderId: "308166224942",
  appId: "1:308166224942:web:46ec1026ea8c7d0d79c3bf",
  measurementId: "G-B1XC8J0BSF",
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Padrao OLJR: sessao persistente (login lembrado 90 dias) — IndexedDB/localStorage.
// Se o browser bloquear (navegacao privada/configuracao restrita),
// cai pra inMemoryPersistence (perde no fechar da aba, mas nao quebra login).
setPersistence(auth, browserLocalPersistence).catch(() => {
  setPersistence(auth, inMemoryPersistence).catch(() => {})
})
