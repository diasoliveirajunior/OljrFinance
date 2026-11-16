import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"

// Config pública do projeto Firebase (mesma do site atual — chave de cliente).
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
