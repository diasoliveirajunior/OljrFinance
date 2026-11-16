import { useParams, Navigate } from "react-router-dom"
import { useAuth } from "@/contexts/auth"
import { PAINEL_INFO } from "@/lib/paineis"
import type { Painel as PainelKey } from "@/lib/types"
import { PainelFinance } from "@/pages/painel/Finance"

export function Painel() {
  const { key } = useParams()
  const { me, isAdmin } = useAuth()

  const upper = (key ?? "").toUpperCase() as PainelKey
  const info = PAINEL_INFO[upper]

  if (!info) return <Navigate to="/" replace />
  if (!isAdmin && !me?.usuario?.paineis?.includes(upper)) {
    return <Navigate to="/" replace />
  }

  if (upper === "FINANCE") return <PainelFinance />

  return <Navigate to="/" replace />
}
