import { Navigate } from "react-router-dom"

// Hub SEDUC ficou no OljrSite. Aqui o Hub é só um redirect pro painel Finance —
// a página de entrada depois do login neste repo é sempre o próprio Finance.
export function Hub() {
  return <Navigate to="/painel/finance" replace />
}
