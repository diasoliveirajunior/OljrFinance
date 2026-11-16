import { useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth"
import { FirebaseError } from "firebase/app"
import { Loader2 } from "lucide-react"
import { auth } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

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
  const isFinanceHost =
    window.location.hostname.toLowerCase() === "finance.oljr.com.br"
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
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
    <div className="min-h-svh flex items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {isFinanceHost ? "OLJR Finance" : "OLJR Analytics"}
          </CardTitle>
          <CardDescription>
            {isFinanceHost
              ? "Seu controle financeiro pessoal e familiar"
              : "Entre com seu e-mail e senha"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={entrar} className="flex flex-col gap-4">
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}
            {aviso && (
              <Alert>
                <AlertDescription>{aviso}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="senha">Senha</Label>
                <button
                  type="button"
                  onClick={esqueciSenha}
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={carregando}>
              {carregando && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Não tem acesso?{" "}
            <button
              type="button"
              onClick={() => navigate("/solicitar-acesso")}
              className="text-foreground underline underline-offset-4"
            >
              Solicitar acesso
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
