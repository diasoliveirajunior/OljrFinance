import { apiFetch } from "./api"

export type TipoLancamento = "receita" | "despesa"
export type TipoConta = "corrente" | "poupanca" | "carteira" | "outra"
export type BandeiraCartao = "visa" | "mastercard" | "elo" | "amex" | "hipercard" | "outra"
export type TipoInvestimento =
  | "tesouro" | "cdb" | "lci" | "lca" | "fundo" | "acao" | "fii" | "cripto" | "poupanca" | "outro"
export type FormaPagamento =
  | "extrato" | "debito" | "credito" | "transferencia" | "pix" | "dinheiro"

export interface Lancamento {
  id: string
  email: string
  data: string
  descricao: string
  categoria: string
  valor: number
  tipo: TipoLancamento
  conta_id?: string | null
  cartao_id?: string | null
  origem_texto?: string | null
  forma_pagamento?: FormaPagamento
  litros?: number | null
  odometro?: number | null
  origem?: "manual" | "ofx" | "drive_xlsx"
  ofx_fitid?: string | null
}

export interface Combustivel {
  abastecimentos: number
  amostras_consumo: number
  consumo_medio_km_l: number
  preco_medio_litro_mes: number
  preco_medio_litro_geral: number
  litros_mes: number
  gasto_mes: number
  km_rodados_mes: number
  ultimo_odometro: number | null
}

export interface Conta {
  id: string
  nome: string
  banco?: string | null
  tipo: TipoConta
  cor: string
  saldo_inicial: number
  saldo_atual: number
  observacao?: string | null
}

export interface Cartao {
  id: string
  nome: string
  bandeira: BandeiraCartao
  banco?: string | null
  limite: number
  divida_inicial: number
  dia_fechamento: number
  dia_vencimento: number
  cor: string
  fatura_atual: number
  limite_usado: number
  limite_disponivel: number
  ciclo_ini: string
  ciclo_fim: string
  percentual: number
}

export interface Investimento {
  id: string
  nome: string
  tipo: TipoInvestimento
  instituicao?: string | null
  valor_aplicado: number
  valor_atual: number
  rentabilidade_anual: number
  rentabilidade_real: number
  data_aplicacao: string
  vencimento?: string | null
  observacao?: string | null
  cor: string
}

export interface Patrimonio {
  patrimonio_total: number
  contas: number
  investimentos: number
  investimentos_aplicado: number
  faturas_abertas: number
  receita_mes: number
  despesa_mes: number
  saldo_mes: number
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
  conta_id?: string | null
  cartao_id?: string | null
  origem_texto?: string | null
  forma_pagamento?: FormaPagamento
  litros?: number | null
  odometro?: number | null
}) {
  return apiFetch<{ ok: boolean; id: string }>("/api/finance/lancamentos", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function removerLancamento(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/finance/lancamentos/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export function getResumo() {
  return apiFetch<ResumoFinance>("/api/finance/resumo")
}

export function getPatrimonio() {
  return apiFetch<Patrimonio>("/api/finance/patrimonio")
}

export function getCombustivel() {
  return apiFetch<Combustivel>("/api/finance/combustivel")
}

export interface PreferenciasPainel {
  mostrar_cartoes: boolean
  mostrar_investimentos: boolean
  mostrar_veiculo: boolean
  mostrar_grupo_familiar: boolean
}

export function getPreferenciasPainel() {
  return apiFetch<PreferenciasPainel>("/api/finance/preferencias")
}

export function salvarPreferenciasPainel(body: Partial<PreferenciasPainel>) {
  return apiFetch<{ ok: boolean }>("/api/finance/preferencias", {
    method: "PUT", body: JSON.stringify(body),
  })
}

export interface OfxPreview {
  fitid: string
  data: string
  descricao: string
  valor: number
  tipo: TipoLancamento
  categoria: string
}

export function importarOfx(body: {
  ofxContent: string
  banco?: string
  conta_id?: string | null
  cartao_id?: string | null
  preview_only?: boolean
}) {
  return apiFetch<{
    ok: boolean
    preview_only?: boolean
    importadas?: number
    duplicadas?: number
    totalNoArquivo: number
    preview: OfxPreview[]
  }>("/api/finance/importar-ofx", { method: "POST", body: JSON.stringify(body) })
}

export function listarContas() {
  return apiFetch<{ contas: Conta[] }>("/api/finance/contas")
}

export function criarConta(body: {
  banco: string; tipo: TipoConta; cor?: string;
  saldo_inicial?: number; observacao?: string;
}) {
  return apiFetch<{ ok: boolean; id: string }>("/api/finance/contas", {
    method: "POST", body: JSON.stringify(body),
  })
}

export function atualizarConta(id: string, body: Partial<Conta>) {
  return apiFetch<{ ok: boolean }>(`/api/finance/contas/${encodeURIComponent(id)}`, {
    method: "PUT", body: JSON.stringify(body),
  })
}

export function removerConta(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/finance/contas/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export function listarCartoes() {
  return apiFetch<{ cartoes: Cartao[] }>("/api/finance/cartoes")
}

export function criarCartao(body: {
  nome: string; bandeira: BandeiraCartao; banco?: string;
  limite: number; divida_inicial?: number;
  dia_fechamento: number; dia_vencimento: number; cor?: string;
}) {
  return apiFetch<{ ok: boolean; id: string }>("/api/finance/cartoes", {
    method: "POST", body: JSON.stringify(body),
  })
}

export function atualizarCartao(id: string, body: Partial<Cartao>) {
  return apiFetch<{ ok: boolean }>(`/api/finance/cartoes/${encodeURIComponent(id)}`, {
    method: "PUT", body: JSON.stringify(body),
  })
}

export function removerCartao(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/finance/cartoes/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export function listarInvestimentos() {
  return apiFetch<{ investimentos: Investimento[] }>("/api/finance/investimentos")
}

export function criarInvestimento(body: {
  nome: string; tipo: TipoInvestimento; instituicao?: string;
  valor_aplicado: number; valor_atual?: number; rentabilidade_anual?: number;
  data_aplicacao: string; vencimento?: string; observacao?: string; cor?: string;
}) {
  return apiFetch<{ ok: boolean; id: string }>("/api/finance/investimentos", {
    method: "POST", body: JSON.stringify(body),
  })
}

export function atualizarInvestimento(id: string, body: Partial<Investimento>) {
  return apiFetch<{ ok: boolean }>(`/api/finance/investimentos/${encodeURIComponent(id)}`, {
    method: "PUT", body: JSON.stringify(body),
  })
}

export function removerInvestimento(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/finance/investimentos/${encodeURIComponent(id)}`, { method: "DELETE" })
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export function fmtBRL(n: number): string {
  return BRL.format(Number.isFinite(n) ? n : 0)
}

export function fmtData(data: string | { _seconds?: number } | null | undefined): string {
  if (!data) return "—"
  if (typeof data === "object") {
    if (data._seconds) return new Date(data._seconds * 1000).toLocaleDateString("pt-BR")
    return "—"
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data))
  if (!m) return String(data)
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function fmtDataCurta(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ""))
  if (!m) return data || ""
  return `${m[3]}/${m[2]}`
}
