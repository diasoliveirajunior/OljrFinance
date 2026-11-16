import { apiFetch } from "./api"
import type { Permissao } from "./types"

type FsTimestamp = { _seconds: number; _nanoseconds?: number } | null

export interface Solicitacao {
  id: string
  email: string
  nome?: string | null
  vinculo?: string | null
  instituicao?: string | null
  mensagem?: string | null
  status: "pendente" | "aprovada" | "rejeitada"
  criado_em?: FsTimestamp
  decidido_por?: string | null
}

export interface UsuarioAdmin {
  id: string
  email: string
  papel: string
  ativo: boolean
  paineis: Permissao[]
  nome?: string | null
  vinculo?: string | null
  instituicao?: string | null
  org?: string | null
  expira_em?: string | null
  motivo_inativacao?: string | null
  ultimo_acesso?: FsTimestamp
  criado_em?: FsTimestamp
  acessos?: number | null
}

// Papéis canônicos do portal (espelha backend PAPEIS).
// 'admin' e 'usuario' são apelidos legados (admin→CEO, usuario→membro) — só pra exibição.
export type Papel = "CEO" | "co_gestor" | "membro" | "convidado"

export const PAPEL_LABEL: Record<string, string> = {
  CEO: "CEO",
  admin: "CEO",
  co_gestor: "Co-gestor",
  membro: "Membro",
  usuario: "Membro",
  convidado: "Convidado",
}

export function papelCanonico(p?: string | null): Papel {
  const s = String(p || "").trim()
  if (s === "admin") return "CEO"
  if (s === "usuario") return "membro"
  if (s === "CEO" || s === "co_gestor" || s === "membro" || s === "convidado") return s
  return "membro"
}

// E-mail unico do CEO dono do portal. Espelha ADMIN_EMAIL do backend.
export const CEO_EMAIL = "diasoliveirajunior@gmail.com"

// Termos que sao papel/rotulo — se vierem no campo 'nome', exibimos o email no lugar,
// pra evitar que alguem aparece como "CEO" so porque preencheu o cadastro errado.
const TERMOS_DE_PAPEL = new Set([
  "ceo", "co-gestor", "co gestor", "cogestor", "co_gestor",
  "membro", "convidado", "administrador", "admin", "usuario", "usuário",
])

// Nome a exibir pra um usuario. Garante que o titulo CEO so apareca pro dono real.
export function nomeExibicao(u: { email: string; nome?: string | null }): string {
  if (u.email === CEO_EMAIL) return "José Dias de Oliveira Junior"
  const nome = String(u.nome || "").trim()
  if (!nome) return u.email
  if (TERMOS_DE_PAPEL.has(nome.toLowerCase())) return u.email
  return nome
}

export interface LogAcesso {
  id: string
  evento: string
  email?: string | null
  alvo?: string | null
  ip?: string | null
  papel?: string | null
  paineis?: Permissao[]
  em?: FsTimestamp
}

export interface DecisaoResposta {
  ok: boolean
  status: string
  activationLink?: string | null
  activationError?: string | null
}

export function listarSolicitacoes(status = "pendente") {
  return apiFetch<{ solicitacoes: Solicitacao[] }>(
    `/api/rbac/solicitacoes?status=${encodeURIComponent(status)}`,
  )
}

export function decidirSolicitacao(body: {
  email: string
  decisao: "aprovar" | "rejeitar"
  papel?: string
  paineis?: Permissao[]
  expira_em?: string | null
}) {
  return apiFetch<DecisaoResposta>("/api/rbac/solicitacoes/decidir", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function listarUsuarios() {
  return apiFetch<{ usuarios: UsuarioAdmin[] }>("/api/rbac/usuarios")
}

export function atualizarUsuario(body: {
  email: string
  papel?: string
  paineis?: Permissao[]
  ativo?: boolean
  org?: string | null
  expira_em?: string | null
}) {
  return apiFetch<{ ok: boolean }>("/api/rbac/usuarios/atualizar", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function enviarSenhaUsuario(email: string) {
  return apiFetch<{ ok: boolean }>("/api/rbac/usuarios/enviar-senha", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}

export function listarLogs(limit = 100) {
  return apiFetch<{ logs: LogAcesso[] }>(`/api/rbac/logs?limit=${limit}`)
}

// Pré-cadastro de e-mails (whitelist) — gerenciada pelo admin.
// Categorias com pré-cadastro obrigatório (publico fica livre).
export type CategoriaPrelista = "equipe_oljr" | "privado" | "particular"

export interface PrelistaItem {
  id: string
  email: string
  categoria: CategoriaPrelista
  nota?: string | null
  adicionado_por?: string | null
  adicionado_em?: FsTimestamp
}

export const CATEGORIA_LABEL: Record<CategoriaPrelista, string> = {
  equipe_oljr: "Equipe Oliveira Junior - OlJr",
  privado: "Empresa Privada",
  particular: "Particular",
}

export function listarPrelista(categoria?: CategoriaPrelista) {
  const qs = categoria ? `?categoria=${encodeURIComponent(categoria)}` : ""
  return apiFetch<{ prelista: PrelistaItem[] }>(`/api/rbac/prelista${qs}`)
}

export function adicionarPrelista(body: {
  email: string
  categoria: CategoriaPrelista
  nota?: string | null
  enviar_convite?: boolean
}) {
  return apiFetch<{ ok: boolean; conviteEnviado?: boolean; conviteError?: string | null }>(
    "/api/rbac/prelista/adicionar",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  )
}

export function removerPrelista(email: string) {
  return apiFetch<{ ok: boolean }>("/api/rbac/prelista/remover", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}

export function reenviarConvitePrelista(email: string) {
  return apiFetch<{ ok: boolean }>("/api/rbac/prelista/reenviar", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}

export function fmtData(ts?: FsTimestamp): string {
  if (!ts || typeof ts._seconds !== "number") return "—"
  return new Date(ts._seconds * 1000).toLocaleString("pt-BR")
}
