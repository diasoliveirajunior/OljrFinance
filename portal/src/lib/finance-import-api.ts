import { apiFetch } from "./api"

export type FormatoImportacao = "ofx" | "xlsx" | "csv" | "pdf"
export type ColunasImportacao = Record<"data" | "descricao" | "valor" | "tipo" | "categoria" | "entrada" | "saida" | "saldo", number>
export interface LinhaImportacao {
  sourceId: string
  fitid?: string | null
  data: string
  descricao: string
  valor: string
  tipo: "receita" | "despesa" | ""
  categoria: string
  identificado_por?: string
  saldo_apos?: number | null
}
export interface PreviaImportacao {
  formato: FormatoImportacao
  rows: LinhaImportacao[]
  avisos: string[]
  abas?: string[]
  aba?: number
  cabecalho?: number
  colunas?: string[]
  mapeamento?: ColunasImportacao
  amostra?: string[][]
  saldos?: { data: string; descricao: string; valor: number | null }[]
  conferencia?: { verificadas: number; linhas_divergentes: number[] }
  drive?: { file_id: string; versao: string }
}
export interface ArquivoImportacao {
  nome: string
  arquivo?: string
  drive_file_id?: string
  convencao?: "auto" | "positivo_entrada" | "positivo_saida"
  aba?: number
  cabecalho?: number
  colunas?: ColunasImportacao
}
export function lerExtrato(body: ArquivoImportacao) {
  return apiFetch<PreviaImportacao>("/api/finance/importacao/previa", { method: "POST", body: JSON.stringify(body) })
}
export function confirmarExtrato(body: { formato: FormatoImportacao; lancamentos: LinhaImportacao[]; conta_id: string | null; cartao_id: string | null; drive?: PreviaImportacao["drive"] }) {
  return apiFetch<{ importadas: number; duplicadas: number }>("/api/finance/importacao/confirmar", { method: "POST", body: JSON.stringify(body) })
}
export function valorImportacao(text: string): number {
  const value = text.replace(/\s|R\$/g, "")
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value
  return /^\d+(?:\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN
}
export function erroLinha(row: LinhaImportacao): string {
  const parsed = new Date(`${row.data}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.data) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== row.data) return "Confira a data."
  if (!row.descricao.trim()) return "Informe a descrição."
  const value = valorImportacao(row.valor)
  if (!Number.isFinite(value) || value <= 0 || value > 999999999.99) return "Informe um valor maior que zero."
  if (!row.tipo) return "Escolha entrada ou saída."
  return ""
}
