import { Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Painel } from "./types"

export const PAINEL_INFO: Record<
  Painel,
  { nome: string; descricao: string; Icon: LucideIcon }
> = {
  FINANCE: {
    nome: "Finance",
    descricao: "Controle financeiro pessoal e familiar.",
    Icon: Wallet,
  },
}

export const ORDEM_PAINEIS: Painel[] = ["FINANCE"]
