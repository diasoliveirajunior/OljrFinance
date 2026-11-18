import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile,
} from "firebase/auth"
import { FirebaseError } from "firebase/app"
import { Camera, Eye, EyeOff, Loader2, X } from "lucide-react"
import { useAuth } from "@/contexts/auth"
import { auth } from "@/lib/firebase"

type Aba = "perfil" | "senha"

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function msgErro(code: string): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Senha atual incorreta."
    case "auth/weak-password":
      return "Senha nova muito fraca (mínimo 8 caracteres, 1 maiúscula e 1 especial)."
    case "auth/requires-recent-login":
      return "Por segurança, saia e entre de novo antes de trocar a senha."
    case "auth/network-request-failed":
      return "Falha de rede. Verifique a conexão."
    default:
      return "Não foi possível concluir a ação. Tente novamente."
  }
}

export function PerfilModal({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  const { firebaseUser, me } = useAuth()
  const [aba, setAba] = useState<Aba>("perfil")
  const [nome, setNome] = useState("")
  const [foto, setFoto] = useState<string | null>(null)
  const [senhaAtual, setSenhaAtual] = useState("")
  const [senhaNova, setSenhaNova] = useState("")
  const [senhaNova2, setSenhaNova2] = useState("")
  const [verAtual, setVerAtual] = useState(false)
  const [verNova, setVerNova] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setAba("perfil")
    setNome(firebaseUser?.displayName || me?.usuario?.nome || "")
    setFoto(firebaseUser?.photoURL || null)
    setSenhaAtual(""); setSenhaNova(""); setSenhaNova2("")
    setVerAtual(false); setVerNova(false)
    setErro(null); setAviso(null); setSalvando(false)
  }, [aberto, firebaseUser, me])

  async function salvarPerfil(e: FormEvent) {
    e.preventDefault()
    if (!firebaseUser) return
    setSalvando(true); setErro(null); setAviso(null)
    try {
      await updateProfile(firebaseUser, {
        displayName: nome.trim() || null,
        photoURL: foto || null,
      })
      setAviso("Perfil atualizado.")
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : ""
      setErro(msgErro(code))
    } finally {
      setSalvando(false)
    }
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault()
    if (!firebaseUser || !firebaseUser.email) return
    if (senhaNova !== senhaNova2) { setErro("As senhas novas não coincidem."); return }
    if (senhaNova.length < 8) { setErro("Senha nova precisa ter no mínimo 8 caracteres."); return }
    if (!/[A-Z]/.test(senhaNova)) { setErro("Senha precisa de pelo menos 1 letra maiúscula."); return }
    if (!/[^A-Za-z0-9]/.test(senhaNova)) { setErro("Senha precisa de pelo menos 1 caractere especial."); return }

    setSalvando(true); setErro(null); setAviso(null)
    try {
      const cred = EmailAuthProvider.credential(firebaseUser.email, senhaAtual)
      await reauthenticateWithCredential(firebaseUser, cred)
      await updatePassword(firebaseUser, senhaNova)
      setAviso("Senha trocada. A nova senha vale pra todos os sistemas OLJR.")
      setSenhaAtual(""); setSenhaNova(""); setSenhaNova2("")
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : ""
      setErro(msgErro(code))
    } finally {
      setSalvando(false)
    }
  }

  function escolherFoto() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return
      if (f.size > 500 * 1024) {
        setErro("Imagem muito grande (máx 500 KB).")
        return
      }
      const reader = new FileReader()
      reader.onload = () => { setFoto(String(reader.result)); setErro(null) }
      reader.readAsDataURL(f)
    }
    input.click()
  }

  if (!aberto) return null

  return (
    <div className="ff-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
      <div className="ff-modal" role="dialog">
        <div className="ff-modal-head">
          <h2>Perfil</h2>
          <button className="ff-icon-btn" onClick={fechar} aria-label="Fechar"><X className="size-4" /></button>
        </div>

        <div className="ff-tabs">
          <button className={aba === "perfil" ? "is-active" : ""} onClick={() => { setAba("perfil"); setErro(null); setAviso(null) }}>
            Meus dados
          </button>
          <button className={aba === "senha" ? "is-active" : ""} onClick={() => { setAba("senha"); setErro(null); setAviso(null) }}>
            Alterar senha
          </button>
        </div>

        {aba === "perfil" ? (
          <form onSubmit={salvarPerfil} className="ff-modal-form">
            <div className="ff-field ff-field--full ff-perfil-avatar-wrap">
              <button type="button" className="ff-perfil-avatar" onClick={escolherFoto} aria-label="Trocar foto">
                {foto ? (
                  <img src={foto} alt="Foto do perfil" />
                ) : (
                  <span>{iniciais(nome || firebaseUser?.email || "?")}</span>
                )}
                <div className="ff-perfil-avatar-overlay"><Camera className="size-4" /></div>
              </button>
              <div className="ff-inline-hint" style={{ textAlign: "center" }}>
                Clique na foto pra trocar (máx 500 KB)
              </div>
            </div>
            <div className="ff-field ff-field--full">
              <label>Nome</label>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" />
            </div>
            <div className="ff-field ff-field--full">
              <label>E-mail</label>
              <input type="email" value={firebaseUser?.email || ""} disabled />
              <div className="ff-inline-hint">E-mail só o administrador pode mudar.</div>
            </div>
            {erro && <div className="ff-alert ff-alert--danger">{erro}</div>}
            {aviso && <div className="ff-alert ff-alert--ok">{aviso}</div>}
            <div className="ff-modal-actions">
              <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Fechar</button>
              <button type="submit" className="ff-btn ff-btn--primary" disabled={salvando}>
                {salvando && <Loader2 className="size-4 animate-spin" />} Salvar
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={trocarSenha} className="ff-modal-form">
            <div className="ff-field ff-field--full">
              <p className="ff-inline-hint">
                Nova senha vale pra TODOS os sistemas OLJR (SEDUC, Finance, CEO). Mínimo 8 caracteres,
                1 maiúscula, 1 especial (padrão OLJR aprovado 22/10).
              </p>
            </div>
            <div className="ff-field ff-field--full">
              <label>Senha atual</label>
              <div style={{ position: "relative" }}>
                <input type={verAtual ? "text" : "password"} value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)} required autoComplete="current-password"
                  style={{ width: "100%", paddingRight: "2.5rem" }} />
                <button type="button" onClick={() => setVerAtual(!verAtual)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: 0, color: "var(--ff-fg-muted)", cursor: "pointer", padding: 4 }}>
                  {verAtual ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="ff-field ff-field--full">
              <label>Nova senha</label>
              <div style={{ position: "relative" }}>
                <input type={verNova ? "text" : "password"} value={senhaNova}
                  onChange={(e) => setSenhaNova(e.target.value)} required autoComplete="new-password"
                  style={{ width: "100%", paddingRight: "2.5rem" }} />
                <button type="button" onClick={() => setVerNova(!verNova)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: 0, color: "var(--ff-fg-muted)", cursor: "pointer", padding: 4 }}>
                  {verNova ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="ff-field ff-field--full">
              <label>Confirme a nova senha</label>
              <input type={verNova ? "text" : "password"} value={senhaNova2}
                onChange={(e) => setSenhaNova2(e.target.value)} required autoComplete="new-password" />
            </div>
            {erro && <div className="ff-alert ff-alert--danger">{erro}</div>}
            {aviso && <div className="ff-alert ff-alert--ok">{aviso}</div>}
            <div className="ff-modal-actions">
              <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Fechar</button>
              <button type="submit" className="ff-btn ff-btn--primary" disabled={salvando || !senhaAtual || !senhaNova}>
                {salvando && <Loader2 className="size-4 animate-spin" />} Trocar senha
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// Para o sidebar/topbar re-usarem o auth sem duplicar import.
export { auth as firebaseAuth }
