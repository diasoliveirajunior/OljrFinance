import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { AlertCircle, CheckCircle2, Cloud, FileInput, Loader2, Upload, X } from "lucide-react"
import { GoogleDriveSource } from "./GoogleDriveSource"
import { fmtBRL, type Cartao, type Conta } from "@/lib/finance-api"
import { confirmarExtrato, erroLinha, lerExtrato, valorImportacao,
  type ArquivoImportacao, type ColunasImportacao, type LinhaImportacao, type PreviaImportacao } from "@/lib/finance-import-api"

type Props = { aberto: boolean; fechar: () => void; contas: Conta[]; cartoes: Cartao[] }
type EditableRow = LinhaImportacao & { selected: boolean }
const fields: { key: keyof ColunasImportacao; label: string }[] = [
  { key: "data", label: "Data" }, { key: "descricao", label: "Descrição" }, { key: "valor", label: "Valor" },
  { key: "tipo", label: "Tipo (opcional)" }, { key: "categoria", label: "Categoria (opcional)" },
  { key: "entrada", label: "Entrada / crédito (opcional)" }, { key: "saida", label: "Saída / débito (opcional)" },
  { key: "saldo", label: "Saldo após o movimento (opcional)" },
]
export function ImportarExtratoModal(props: Props) {
  return props.aberto ? <ImportSession {...props} /> : null
}
function ImportSession({ fechar, contas, cartoes }: Props) {
  const qc = useQueryClient()
  const [file, setFile] = useState<ArquivoImportacao | null>(null)
  const [source, setSource] = useState<"computador" | "drive">(() => new URLSearchParams(window.location.search).has("drive") ? "drive" : "computador")
  const [preview, setPreview] = useState<PreviaImportacao | null>(null)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [destino, setDestino] = useState(contas[0] ? `conta:${contas[0].id}` : cartoes[0] ? `cartao:${cartoes[0].id}` : "")
  const [aba, setAba] = useState(0)
  const [header, setHeader] = useState(1)
  const [columns, setColumns] = useState<ColunasImportacao>({ data: -1, descricao: -1, valor: -1, tipo: -1, categoria: -1, entrada: -1, saida: -1, saldo: -1 })
  const [convention, setConvention] = useState<NonNullable<ArquivoImportacao["convencao"]>>("auto")
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [page, setPage] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])
  const busy = reading || saving
  const selected = rows.filter(row => row.selected)
  const invalid = selected.filter(row => erroLinha(row)).length
  const totals = selected.reduce((sum, row) => {
    const amount = valorImportacao(row.valor)
    if (Number.isFinite(amount) && row.tipo) sum[row.tipo] += Math.round(amount * 100)
    return sum
  }, { receita: 0, despesa: 0 })
  const targets = [...contas.map(c => ({ value: `conta:${c.id}`, label: `${c.nome} (conta)` })),
    ...cartoes.map(c => ({ value: `cartao:${c.id}`, label: `${c.nome} (cartão)` }))]
  function resetFile() { request.current++; setPreview(null); setRows([]); setFile(null); setConfirmed(false); setSuccess(""); setError("") }

  async function readFile(payload: ArquivoImportacao, token: number) {
    try {
      const result = await lerExtrato(payload)
      if (token !== request.current) return
      setPreview(result); setRows(result.rows.map((row, i) => ({ ...row, selected: i < 400 && !erroLinha(row) })))
      setAba(result.aba ?? 0); setHeader((result.cabecalho ?? 0) + 1)
      if (result.mapeamento) setColumns(result.mapeamento)
      setPage(0); setConfirmed(false)
    } catch (e) { if (token === request.current) setError((e as Error).message) }
    finally { if (token === request.current) setReading(false) }
  }
  async function chooseFile(chosen?: File) {
    const token = ++request.current
    setRows([]); setPreview(null); setFile(null); setSuccess(""); setError(""); setConfirmed(false)
    if (!chosen) { setReading(false); return }
    if (!/\.(ofx|xlsx|csv|pdf)$/i.test(chosen.name)) { setError("Escolha OFX, Excel (.xlsx), CSV ou PDF. Converta arquivos .xls para .xlsx."); return }
    if (chosen.size > 3 * 1024 * 1024 || !chosen.size) { setError("Escolha um arquivo de até 3 MB."); return }
    setReading(true)
    try {
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(",")[1])
        reader.onerror = () => reject(new Error("Não foi possível abrir o arquivo."))
        reader.readAsDataURL(chosen)
      })
      if (token !== request.current) return
      const payload = { nome: chosen.name, arquivo: encoded }
      setFile(payload); await readFile(payload, token)
    } catch (e) { if (token === request.current) { setError((e as Error).message); setReading(false) } }
  }
  function updateRow(index: number, patch: Partial<EditableRow>) {
    setRows(current => current.map((row, i) => i === index ? { ...row, ...patch, identificado_por: patch.selected === undefined ? "Editado na prévia" : row.identificado_por } : row)); setConfirmed(false)
  }
  function remap(next: { aba?: number; cabecalho?: number; colunas?: ColunasImportacao; convencao?: ArquivoImportacao["convencao"] }) {
    if (!file) return
    setRows([]); setError(""); setReading(true); setConfirmed(false)
    const payload = { ...file, convencao: convention, ...next }
    setFile(payload)
    void readFile(payload, ++request.current)
  }
  async function save() {
    if (!preview || !selected.length || invalid || !confirmed || saving || selected.length > 400) return
    const [kind, id] = destino.split(":")
    if (!id) return
    setSaving(true); setError("")
    try {
      const result = await confirmarExtrato({ formato: preview.formato,
        lancamentos: selected.map(row => ({ ...row, valor: valorImportacao(row.valor).toFixed(2) })),
        conta_id: kind === "conta" ? id : null, cartao_id: kind === "cartao" ? id : null,
        drive: preview.drive })
      setSuccess(`${result.importadas} lançamento(s) importado(s). ${result.duplicadas} repetido(s) ignorado(s).`)
      setRows(current => current.filter(row => !row.selected)); setConfirmed(false); setPage(0)
      await qc.invalidateQueries({ queryKey: ["finance"] })
      if (preview.drive) await qc.invalidateQueries({ queryKey: ["finance-drive"] })
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) fechar() }}>
    <Dialog.Overlay className="ff-import-overlay" />
    <Dialog.Content className="ff-modal ff-import-modal" onEscapeKeyDown={e => { if (busy) e.preventDefault() }} onPointerDownOutside={e => e.preventDefault()}>
      <div className="ff-modal-head">
        <Dialog.Title>Importar extrato</Dialog.Title>
        <button type="button" className="ff-icon-btn" aria-label="Fechar importação" onClick={fechar} disabled={busy}><X className="size-4" /></button>
      </div>
      <Dialog.Description className="ff-import-help">Leia do computador ou do Google Drive, confira os lançamentos e confirme os selecionados.</Dialog.Description>
      <div className="ff-filters" aria-label="Origem do extrato">
        <button type="button" className={`ff-chip ${source === "computador" ? "is-active" : ""}`} disabled={busy} onClick={() => { resetFile(); setSource("computador") }}><Upload className="size-4" /> Do computador</button>
        <button type="button" className={`ff-chip ${source === "drive" ? "is-active" : ""}`} disabled={busy} onClick={() => { resetFile(); setSource("drive") }}><Cloud className="size-4" /> Google Drive</button>
      </div>
      <div className="ff-import-controls">
        <label className="ff-field">Conta ou cartão de destino
          <select value={destino} disabled={busy} onChange={e => { setDestino(e.target.value); setConfirmed(false) }}>
            <option value="">Escolha o destino</option>
            {targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {source === "computador" && <label className="ff-import-upload">
          <Upload className="size-5" />
          <span>{file ? file.nome : "Escolher arquivo"}<small>OFX, Excel (.xlsx), CSV ou PDF · até 3 MB</small></span>
          <input type="file" accept=".ofx,.xlsx,.csv,.pdf" aria-label="Arquivo de extrato" disabled={busy} onChange={e => { void chooseFile(e.target.files?.[0]); e.target.value = "" }} />
        </label>}
      </div>
      {source === "drive" && <details className="ff-import-mapping-panel" open={file ? undefined : true}>
        <summary>Google Drive: conexão, pasta e arquivos</summary>
        <GoogleDriveSource destino={destino} ocupado={busy} limpar={resetFile} escolher={chosen => {
        resetFile(); setReading(true)
        const payload = { nome: chosen.nome, drive_file_id: chosen.id }
        setFile(payload); void readFile(payload, ++request.current)
      }} /></details>}
      {source === "drive" && file && <p className="ff-import-help">Arquivo em revisão: <strong>{file.nome}</strong></p>}
      {!targets.length && <p className="ff-alert ff-alert--danger">Cadastre uma conta ou um cartão antes de importar.</p>}
      {(!preview || preview.formato === "pdf") && <p className="ff-import-help">PDF precisa ter texto selecionável, datas com ano e um valor por linha. PDFs escaneados não são lidos nesta versão.</p>}
      {preview?.colunas && <details className="ff-import-mapping-panel" open={rows.length ? undefined : true}>
        <summary>Colunas da planilha: conferir ou ajustar</summary>
        <fieldset className="ff-import-mapping" disabled={busy}>
        <legend>Organizar a planilha</legend>
        <label className="ff-field">Aba<select value={aba} onChange={e => remap({ aba: Number(e.target.value) })}>{preview.abas?.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label>
        <label className="ff-field">Linha dos títulos<input type="number" min="1" max="100" value={header} onChange={e => { setHeader(Number(e.target.value)); setRows([]); setConfirmed(false) }} /></label>
        <button type="button" className="ff-btn ff-btn--ghost" onClick={() => remap({ aba, cabecalho: header - 1 })}>Ler títulos</button>
        {fields.map(field => <label className="ff-field" key={field.key}>{field.label}<select value={columns[field.key]} onChange={e => { setColumns(current => ({ ...current, [field.key]: Number(e.target.value) })); setRows([]); setConfirmed(false) }}>
          <option value={-1}>Escolha a coluna</option>{preview.colunas?.map((name, i) => <option key={i} value={i}>{i + 1}. {name}</option>)}
        </select></label>)}
        <label className="ff-field">Sinais dos valores<select value={convention} onChange={e => { setConvention(e.target.value as typeof convention); setRows([]); setConfirmed(false) }}>
          <option value="auto">Reconhecer automaticamente</option><option value="positivo_entrada">Positivo é entrada</option><option value="positivo_saida">Positivo é saída (ex.: cartão)</option>
        </select></label>
        <button type="button" className="ff-btn ff-btn--ghost" onClick={() => remap({ aba, cabecalho: header - 1, colunas: columns })}>Atualizar prévia</button>
        {preview.amostra?.length ? <p className="ff-import-sample">Exemplo da primeira linha: {preview.amostra[0].join(" / ")}</p> : null}
      </fieldset></details>}
      {reading && <p role="status" className="ff-import-status"><Loader2 className="size-4 animate-spin" /> Lendo arquivo…</p>}
      {preview?.avisos.map(warning => <p className="ff-import-warning" key={warning}><AlertCircle className="size-4" />{warning}</p>)}
      {!!preview?.saldos?.length && <details className="ff-import-mapping-panel"><summary>Saldos do arquivo: referência, sem gerar entradas ou saídas</summary>
        <ul>{preview.saldos.map((saldo, i) => <li key={i} className="ff-import-help">{saldo.data || "Sem data"} — {saldo.descricao}: {saldo.valor === null ? "Valor não reconhecido" : fmtBRL(saldo.valor)}</li>)}</ul>
      </details>}
      {!!preview?.conferencia?.verificadas && <p className="ff-import-help">Conferência do arquivo original: {preview.conferencia.verificadas} sequência(s) de saldo verificada(s).
        {preview.conferencia.linhas_divergentes.length ? ` Confira as linhas ${preview.conferencia.linhas_divergentes.join(", ")}: os saldos divergem dos movimentos.` : " Os saldos conferem com os movimentos reconhecidos."}
        {" "}Confira novamente se editar ou desmarcar linhas.
      </p>}
      {rows.length > 0 && <>
        <div className="ff-import-summary">
          <span><strong>{selected.length}</strong> de {rows.length} selecionados</span>
          <span>Entradas <strong>{fmtBRL(totals.receita / 100)}</strong></span>
          <span>Saídas <strong>{fmtBRL(totals.despesa / 100)}</strong></span>
        </div>
        <div className="ff-import-toolbar">
          <button type="button" className="ff-link" disabled={busy} onClick={() => { setRows(current => current.map((row, i) => ({ ...row, selected: i < 400 && !erroLinha(row) }))); setConfirmed(false) }}>Selecionar válidos (até 400)</button>
          <button type="button" className="ff-link" disabled={busy} onClick={() => { setRows(current => current.map(row => ({ ...row, selected: false }))); setConfirmed(false) }}>Desmarcar todos</button>
          <span>Linhas incompletas ficam desmarcadas. Corrija e selecione as que deseja importar.</span>
        </div>
        <div className="ff-import-table-wrap"><table className="ff-import-table">
          <caption className="sr-only">Prévia editável dos lançamentos do arquivo</caption>
          <thead><tr><th>Importar</th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor (R$)</th><th>Categoria</th></tr></thead>
          <tbody>{rows.slice(page * 25, page * 25 + 25).map((row, offset) => {
            const i = page * 25 + offset; const issue = erroLinha(row)
            return <tr key={`${row.sourceId}:${i}`} className={issue ? "ff-import-incomplete" : ""}>
              <td><input type="checkbox" aria-label={`Importar linha ${i + 1}`} checked={row.selected} disabled={saving} onChange={e => updateRow(i, { selected: e.target.checked })} /></td>
              <td><input type="date" aria-label={`Data linha ${i + 1}`} value={row.data} disabled={saving} onChange={e => updateRow(i, { data: e.target.value })} /></td>
              <td><input aria-label={`Descrição linha ${i + 1}`} value={row.descricao} maxLength={200} disabled={saving} onChange={e => updateRow(i, { descricao: e.target.value })} />{issue ? <small>{issue}</small> : row.identificado_por && <span className="ff-import-explanation">{row.identificado_por}</span>}</td>
              <td><select aria-label={`Tipo linha ${i + 1}`} value={row.tipo} disabled={saving} onChange={e => updateRow(i, { tipo: e.target.value as LinhaImportacao["tipo"] })}><option value="">Escolha</option><option value="receita">Entrada</option><option value="despesa">Saída</option></select></td>
              <td><input inputMode="decimal" aria-label={`Valor linha ${i + 1}`} value={row.valor} disabled={saving} onChange={e => updateRow(i, { valor: e.target.value })} /></td>
              <td><input aria-label={`Categoria linha ${i + 1}`} value={row.categoria} maxLength={60} disabled={saving} onChange={e => updateRow(i, { categoria: e.target.value })} /></td>
            </tr>
          })}</tbody>
        </table></div>
        <div className="ff-import-pagination"><button type="button" className="ff-btn ff-btn--ghost" disabled={!page || busy} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1} de {Math.ceil(rows.length / 25)}</span><button type="button" className="ff-btn ff-btn--ghost" disabled={(page + 1) * 25 >= rows.length || busy} onClick={() => setPage(page + 1)}>Próxima</button></div>
        {invalid > 0 && <p role="alert" className="ff-alert ff-alert--danger">Corrija ou desmarque {invalid} lançamento(s) incompleto(s).</p>}
        {selected.length > 400 && <p className="ff-alert ff-alert--danger">Selecione até 400 lançamentos por vez. Depois importe os restantes.</p>}
        <p className="ff-import-help">Repetidos da mesma origem e destino serão ignorados. Ao usar formatos diferentes para o mesmo período, confira se as movimentações já existem.</p>
        <label className="ff-import-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Conferi o destino, os lançamentos selecionados e os totais com o arquivo original.</label>
      </>}
      {error && <p role="alert" className="ff-alert ff-alert--danger">{error}</p>}
      {success && <p role="status" className="ff-alert ff-alert--ok"><CheckCircle2 className="size-4" /> {success}</p>}
      <div className="ff-modal-actions">
        <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar} disabled={busy}>{success ? "Fechar" : "Cancelar"}</button>
        <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !destino || !selected.length || !!invalid || selected.length > 400 || !confirmed} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <FileInput className="size-4" />}Importar {selected.length || ""} selecionado(s)
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Root>
}
