export type Painel = "FINANCE"
export type Permissao = Painel

export interface Usuario {
  email: string
  papel: string
  ativo: boolean
  paineis: Permissao[]
  nome?: string | null
  vinculo?: string | null
  instituicao?: string | null
}

export type AccessStatus =
  | "ativo"
  | "inativo"
  | "sem_acesso"
  | "solicitacao_pendente"
  | "solicitacao_aprovada"
  | "solicitacao_rejeitada"

export interface MeResponse {
  autenticado: boolean
  email: string
  status: AccessStatus
  usuario?: Usuario
  solicitacao?: { status: string }
}
