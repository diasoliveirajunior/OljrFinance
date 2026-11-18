import { useEffect, useState } from "react"
import type { ChangeEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, FileText, Loader2, Upload, X } from "lucide-react"
import { fmtBRL, fmtDataCurta, importarOfx, type Cartao, type Conta, type OfxPreview } from "@/lib/finance-api"

export function ImportarOFXModal({
  aberto, fechar, contas, cartoes,
}: {
  aberto: boolean; fechar: () => void; contas: Conta[]; cartoes: Cartao[]
}) {
  const qc = useQueryClient()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [conteudo, setConteudo] = useState<string>("")
  const [destino, setDestino] = useState<string>("")
  const [preview, setPreview] = useState<OfxPreview[]>([])
  const [totalArquivo, setTotalArquivo] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setArquivo(null); setConteudo(""); setPreview([]); setTotalArquivo(0)
    setErro(null); setSucesso(null)
    const d = contas[0] ? `conta:${contas[0].id}` : cartoes[0] ? `cartao:${cartoes[0].id}` : ""
    setDestino(d)
  }, [aberto, contas, cartoes])

  const bancoPadrao = (): string => {
    const [kind, id] = destino.split(":")
    if (kind === "conta") return contas.find((c) => c.id === id)?.banco || "Banco"
    if (kind === "cartao") return cartoes.find((c) => c.id === id)?.banco || "Cartão"
    return "Banco"
  }

  const mutPreview = useMutation({
    mutationFn: () => importarOfx({ ofxContent: conteudo, preview_only: true, banco: bancoPadrao() }),
    onSuccess: (r) => { setPreview(r.preview); setTotalArquivo(r.totalNoArquivo); setErro(null) },
    onError: (e) => setErro((e as Error).message),
  })

  const mutImportar = useMutation({
    mutationFn: () => {
      const [kind, id] = destino.split(":")
      return importarOfx({
        ofxContent: conteudo,
        banco: bancoPadrao(),
        conta_id: kind === "conta" ? id : null,
        cartao_id: kind === "cartao" ? id : null,
      })
    },
    onSuccess: (r) => {
      setSucesso(
        `${r.importadas ?? 0} importada${r.importadas === 1 ? "" : "s"}, ` +
        `${r.duplicadas ?? 0} duplicada${r.duplicadas === 1 ? "" : "s"} ignorada${r.duplicadas === 1 ? "" : "s"}.`
      )
      qc.invalidateQueries({ queryKey: ["finance"] })
    },
    onError: (e) => setErro((e as Error).message),
  })

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith(".ofx")) {
      setErro("Arquivo precisa ser .ofx (OFX do seu internet banking).")
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setErro("Arquivo muito grande (limite 5 MB).")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || "")
      setArquivo(f)
      setConteudo(text)
      setErro(null); setSucesso(null)
      setTimeout(() => mutPreview.mutate(), 50)
    }
    reader.readAsText(f, "utf-8")
  }

  if (!aberto) return null
  const destinoOptions = [
    ...contas.map((c) => ({ value: `conta:${c.id}`, label: `${c.nome} · conta` })),
    ...cartoes.map((c) => ({ value: `cartao:${c.id}`, label: `${c.nome} · cartão` })),
  ]

  return (
    <div className="ff-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
      <div className="ff-modal ff-modal--wide" role="dialog">
        <div className="ff-modal-head">
          <h2>Importar extrato (OFX)</h2>
          <button className="ff-icon-btn" onClick={fechar} aria-label="Fechar"><X className="size-4" /></button>
        </div>

        {!arquivo && (
          <div className="ff-dropzone">
            <Upload className="size-6 text-muted-foreground" />
            <p className="ff-dropzone-title">Envie seu extrato OFX</p>
            <p className="ff-dropzone-hint">Arquivo .ofx baixado do internet banking (até 5 MB)</p>
            <label className="ff-btn ff-btn--primary" style={{ cursor: "pointer" }}>
              <input type="file" accept=".ofx" onChange={handleFile} style={{ display: "none" }} />
              Selecionar arquivo
            </label>
          </div>
        )}

        {arquivo && (
          <div className="ff-field--full" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="ff-file-chip">
              <FileText className="size-4" />
              <span>{arquivo.name}</span>
              <span className="ff-file-size">{(arquivo.size / 1024).toFixed(1)} KB</span>
              <button onClick={() => { setArquivo(null); setConteudo(""); setPreview([]) }} className="ff-icon-btn">
                <X className="size-3" />
              </button>
            </div>

            <div className="ff-field">
              <label>Vincular lançamentos a</label>
              <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                {destinoOptions.length === 0 ? (
                  <option value="">Cadastre uma conta primeiro</option>
                ) : destinoOptions.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {mutPreview.isPending && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ff-fg-muted)", fontSize: 13 }}>
                <Loader2 className="size-4 animate-spin" /> Lendo arquivo…
              </div>
            )}

            {preview.length > 0 && (
              <>
                <div className="ff-label" style={{ marginTop: 4 }}>
                  Prévia · {totalArquivo} transações no arquivo (mostrando até 25)
                </div>
                <div className="ff-ofx-preview">
                  {preview.map((t) => (
                    <div key={t.fitid} className="ff-tx">
                      <div className="ff-tx-icon" style={{
                        background: t.tipo === "receita" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                        color: t.tipo === "receita" ? "var(--ff-success)" : "var(--ff-danger)"
                      }}>
                        {t.tipo === "receita" ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ff-tx-desc">{t.descricao}</div>
                        <div className="ff-tx-meta">{t.categoria}</div>
                      </div>
                      <div className={t.tipo === "receita" ? "ff-tx-amount ff-in" : "ff-tx-amount ff-out"}>
                        {t.tipo === "receita" ? "+ " : "- "}{fmtBRL(t.valor)}
                      </div>
                      <div className="ff-tx-date">{fmtDataCurta(t.data)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {erro && <div className="ff-alert ff-alert--danger" style={{ marginTop: 12 }}>{erro}</div>}
        {sucesso && <div className="ff-alert ff-alert--ok" style={{ marginTop: 12 }}>{sucesso}</div>}

        <div className="ff-modal-actions">
          <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>
            {sucesso ? "Fechar" : "Cancelar"}
          </button>
          {!sucesso && arquivo && preview.length > 0 && destino && (
            <button
              type="button"
              className="ff-btn ff-btn--primary"
              onClick={() => mutImportar.mutate()}
              disabled={mutImportar.isPending}
            >
              {mutImportar.isPending && <Loader2 className="size-4 animate-spin" />}
              Importar {totalArquivo} lançamento{totalArquivo === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
