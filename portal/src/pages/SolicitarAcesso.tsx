import { useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"

const VAZIO = { nome: "", email: "", mensagem: "" }

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
    setEnviando(true)
    try {
      const res = await apiFetch<{ message?: string }>(
        "/api/access/solicitar",
        { method: "POST", body: JSON.stringify(form) },
      )
      setOk(
        res.message ||
          "Solicitação enviada. Você receberá um e-mail quando o acesso for liberado.",
      )
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
    <div className="oljr-auth-scene">
      <div className="oljr-auth-card">
        <div className="oljr-auth-brand">OLJR Finance</div>
        <h1 className="oljr-auth-title">Solicitar acesso</h1>

        {ok ? (
          <>
            <div className="oljr-auth-alert oljr-auth-alert--ok">{ok}</div>
            <div className="oljr-auth-actions">
              <button
                type="button"
                className="oljr-auth-submit"
                onClick={() => navigate("/login")}
              >
                Voltar
              </button>
            </div>
          </>
        ) : (
          <>
            {erro && <div className="oljr-auth-alert oljr-auth-alert--erro">{erro}</div>}
            <form onSubmit={enviar} className="oljr-auth-form">
              <div className="oljr-auth-group">
                <label htmlFor="nome" className="oljr-auth-label">Nome completo</label>
                <input
                  id="nome"
                  required
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  className="oljr-auth-input"
                />
              </div>

              <div className="oljr-auth-group">
                <label htmlFor="email" className="oljr-auth-label">E-mail</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="oljr-auth-input"
                  placeholder="voce@exemplo.com"
                />
              </div>

              <div className="oljr-auth-group">
                <label htmlFor="mensagem" className="oljr-auth-label">
                  Mensagem (opcional)
                </label>
                <input
                  id="mensagem"
                  value={form.mensagem}
                  onChange={(e) => set("mensagem", e.target.value)}
                  className="oljr-auth-input"
                  placeholder="Conte brevemente por que quer acesso"
                />
              </div>

              <div className="oljr-auth-actions">
                <p className="oljr-auth-request">
                  Já tem acesso?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="oljr-auth-link"
                  >
                    Entrar
                  </button>
                </p>
                <button
                  type="submit"
                  disabled={enviando}
                  className="oljr-auth-submit"
                >
                  {enviando && <Loader2 className="size-4 animate-spin" />}
                  Enviar
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
