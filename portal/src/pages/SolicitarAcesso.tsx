import { useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
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

const VAZIO = { nome: "", email: "", vinculo: "", instituicao: "", mensagem: "" }

export function SolicitarAcesso() {
  const navigate = useNavigate()
  const [form, setForm] = useState(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function set<K extends keyof typeof VAZIO>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setOk(null)

    const emailLower = form.email.toLowerCase().trim()
    if (form.vinculo === "privado") {
      const isPrivate = emailLower.endsWith("@empresa.com.br") || emailLower.endsWith("@empresa.com")
      if (!isPrivate) {
        setErro("Este vínculo é restrito a e-mails corporativos de empresas credenciadas.")
        return
      }
    }

    setEnviando(true)
    try {
      const res = await apiFetch<{ message?: string }>(
        "/api/access/solicitar",
        { method: "POST", body: JSON.stringify(form) },
      )
      setOk(res.message || "Solicitação enviada.")
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : "Não foi possível enviar a solicitação.",
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Solicitar acesso</CardTitle>
          <CardDescription>
            Preencha seus dados. O administrador vai analisar e liberar o acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ok ? (
            <div className="flex flex-col gap-4">
              <Alert>
                <AlertDescription>{ok}</AlertDescription>
              </Alert>
              <Button variant="outline" onClick={() => navigate("/login")}>
                Voltar ao login
              </Button>
            </div>
          ) : (
            <form onSubmit={enviar} className="flex flex-col gap-4">
              {erro && (
                <Alert variant="destructive">
                  <AlertDescription>{erro}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2">
                <Label htmlFor="nome">Nome completo</Label>
                <Input
                  id="nome"
                  required
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vinculo">Vínculo</Label>
                <select
                  id="vinculo"
                  value={form.vinculo}
                  onChange={(e) => set("vinculo", e.target.value)}
                  className="border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
                >
                  <option value="">Selecione...</option>
                  <option value="publico">Setor público</option>
                  <option value="privado">Setor privado</option>
                  <option value="particular">Particular</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="instituicao">
                  Instituição / Empresa (opcional)
                </Label>
                <Input
                  id="instituicao"
                  value={form.instituicao}
                  onChange={(e) => set("instituicao", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mensagem">Mensagem (opcional)</Label>
                <Input
                  id="mensagem"
                  value={form.mensagem}
                  onChange={(e) => set("mensagem", e.target.value)}
                />
              </div>
              <Button type="submit" disabled={enviando}>
                {enviando && <Loader2 className="size-4 animate-spin" />}
                Enviar solicitação
              </Button>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-center text-sm text-muted-foreground underline underline-offset-4"
              >
                Voltar ao login
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
