import { useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth"
import { FirebaseError } from "firebase/app"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { auth } from "@/lib/firebase"

function mensagemErro(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "E-mail inválido."
    case "auth/user-disabled":
      return "Esta conta está desativada."
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "E-mail ou senha incorretos."
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde um momento e tente novamente."
    case "auth/operation-not-allowed":
      return "Login por senha não está habilitado. Avise o administrador."
    case "auth/network-request-failed":
      return "Falha de rede. Verifique sua conexão."
    default:
      return "Não foi possível entrar. Tente novamente."
  }
}

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setCarregando(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha)
      navigate("/")
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : ""
      setErro(mensagemErro(code))
    } finally {
      setCarregando(false)
    }
  }

  async function esqueciSenha() {
    setErro(null)
    setAviso(null)
    if (!email.trim()) {
      setErro("Informe seu e-mail para redefinir a senha.")
      return
    }
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setAviso(
        "Enviamos um link para definir/redefinir sua senha. Verifique seu e-mail.",
      )
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : ""
      setErro(mensagemErro(code))
    }
  }

  return (
    <div className="oljr-auth-scene">
      <div className="oljr-auth-card">
        <div className="oljr-auth-brand">OLJR Finance</div>
        <h1 className="oljr-auth-title">Entrar</h1>

        {erro && <div className="oljr-auth-alert oljr-auth-alert--erro">{erro}</div>}
        {aviso && <div className="oljr-auth-alert oljr-auth-alert--ok">{aviso}</div>}

        <form onSubmit={entrar} className="oljr-auth-form">
          <div className="oljr-auth-group">
            <label htmlFor="email" className="oljr-auth-label">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="oljr-auth-input"
              placeholder="voce@exemplo.com"
            />
          </div>

          <div className="oljr-auth-group">
            <label htmlFor="senha" className="oljr-auth-label">Senha</label>
            <div className="oljr-auth-password">
              <input
                id="senha"
                type={verSenha ? "text" : "password"}
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="oljr-auth-input oljr-auth-input--password"
              />
              <button
                type="button"
                onClick={() => setVerSenha((v) => !v)}
                className="oljr-auth-eye"
                aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                title={verSenha ? "Ocultar senha" : "Mostrar senha"}
              >
                {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={esqueciSenha}
              className="oljr-auth-forgot"
            >
              Esqueci minha senha
            </button>
          </div>

          <div className="oljr-auth-actions">
            <p className="oljr-auth-request">
              Não tem acesso?{" "}
              <button
                type="button"
                onClick={() => navigate("/solicitar-acesso")}
                className="oljr-auth-link"
              >
                Solicitar acesso
              </button>
            </p>
            <button type="submit" disabled={carregando} className="oljr-auth-submit">
              {carregando && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
