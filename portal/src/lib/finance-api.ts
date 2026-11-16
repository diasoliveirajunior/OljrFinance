import { apiFetch } from "./api"

export type TipoLancamento = "receita" | "despesa"

export interface Lancamento {
  id: string
  email: string
  data: string // YYYY-MM-DD
  descricao: string
  categoria: string
  valor: number
  tipo: TipoLancamento
  origem?: "manual" | "ofx" | "drive_xlsx"
  ofx_fitid?: string | null
}

export interface ResumoFinance {
  saldo: number
  receita_mes: number
  despesa_mes: number
  qtd_receita_mes: number
  qtd_despesa_mes: number
  taxa_poupanca: number
  categorias_default: string[]
  mes_referencia: string
}

export function listarLancamentos(params: { desde?: string; ate?: string; limit?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.desde) qs.set("desde", params.desde)
  if (params.ate) qs.set("ate", params.ate)
  if (params.limit) qs.set("limit", String(params.limit))
  const s = qs.toString()
  return apiFetch<{ lancamentos: Lancamento[] }>(`/api/finance/lancamentos${s ? "?" + s : ""}`)
}

export function adicionarLancamento(body: {
  data: string
  descricao: string
  categoria: string
  valor: number
  tipo: TipoLancamento
}) {
  return apiFetch<{ ok: boolean; id: string }>("/api/finance/lancamentos", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function removerLancamento(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/finance/lancamentos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}

export function getResumo() {
  return apiFetch<ResumoFinance>("/api/finance/resumo")
}

export interface PontoSerieMensal {
  mes: string // YYYY-MM
  receita: number
  despesa: number
}

export function getSerieMensal(meses: number = 6) {
  return apiFetch<{ serie: PontoSerieMensal[] }>(`/api/finance/serie-mensal?meses=${meses}`)
}

export interface CategoriaMes {
  categoria: string
  total: number
}

export function getCategoriasMes() {
  return apiFetch<{ categorias: CategoriaMes[] }>("/api/finance/categorias-mes")
}

export type Orcamento = Record<string, number>

export function getOrcamento() {
  return apiFetch<{ orcamento: Orcamento }>("/api/finance/orcamento")
}

export function salvarOrcamento(categoria: string, limite: number) {
  return apiFetch<{ ok: boolean; orcamento: Orcamento }>("/api/finance/orcamento", {
    method: "POST",
    body: JSON.stringify({ categoria, limite }),
  })
}

export function fmtMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-")
  if (!y || !m) return yyyymm
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

export interface ResultadoImportOfx {
  ok: boolean
  importadas: number
  duplicadas: number
  totalNoArquivo: number
  preview: Array<{
    data: string
    descricao: string
    valor: number
    tipo: TipoLancamento
    categoria: string
  }>
}

export function importarOfx(ofxContent: string, banco: string) {
  return apiFetch<ResultadoImportOfx>("/api/finance/importar-ofx", {
    method: "POST",
    body: JSON.stringify({ ofxContent, banco }),
  })
}

export interface DriveSyncResult {
  arquivos_encontrados: number
  arquivos_processados: number
  arquivos_ignorados: number
  importadas: number
  duplicadas: number
  erros: Array<{ arquivo: string; erro: string }>
}

export interface DriveStatus {
  ok?: boolean
  conectado: boolean
  pasta_id: string
  pasta_url: string
  conta_google_servico?: string | null
  arquivos_encontrados?: number
  ultima_sincronizacao?: { _seconds?: number } | string | null
  ultimo_resultado?: DriveSyncResult | null
}

export function getDriveStatus() {
  return apiFetch<DriveStatus>("/api/finance/drive/status")
}

export function sincronizarDrive() {
  return apiFetch<{ ok: boolean } & DriveSyncResult>("/api/finance/drive/sincronizar", {
    method: "POST",
  })
}

export type StorageProvider = "google" | "microsoft"

export interface StorageProviderStatus {
  configurado: boolean
  conectado: boolean
  pasta_nome: string | null
  pasta_url: string | null
  conectado_em?: { _seconds?: number } | string | null
}

export function getStorageStatus() {
  return apiFetch<{ providers: Record<StorageProvider, StorageProviderStatus> }>("/api/finance/storage/status")
}

export function conectarStorage(provider: StorageProvider) {
  return apiFetch<{ url: string }>(`/api/finance/storage/connect/${provider}`, { method: "POST" })
}

export function desconectarStorage(provider: StorageProvider) {
  return apiFetch<{ ok: boolean }>(`/api/finance/storage/connect/${provider}`, { method: "DELETE" })
}

export type FinanceMascote = "gato" | "cachorro" | "urso" | "macaco" | "nenhum"
export type FinanceLayout = "confortavel" | "compacto" | "foco"

export interface FinancePreferencias {
  mascote: FinanceMascote
  layout: FinanceLayout
  animacoes: boolean
}

export function getFinancePreferencias() {
  return apiFetch<FinancePreferencias>("/api/finance/preferencias")
}

export function salvarFinancePreferencias(preferencias: FinancePreferencias) {
  return apiFetch<{ ok: boolean } & FinancePreferencias>("/api/finance/preferencias", {
    method: "PUT",
    body: JSON.stringify(preferencias),
  })
}

export function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function fmtData(d: string): string {
  const [y, m, day] = d.split("-")
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}
