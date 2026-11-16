import { lazy, Suspense } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { RequireAuth } from "@/components/RequireAuth"

const Login = lazy(() => import("@/pages/Login").then((m) => ({ default: m.Login })))
const SolicitarAcesso = lazy(() =>
  import("@/pages/SolicitarAcesso").then((m) => ({ default: m.SolicitarAcesso })),
)
const Painel = lazy(() => import("@/pages/Painel").then((m) => ({ default: m.Painel })))
const Admin = lazy(() => import("@/pages/Admin").then((m) => ({ default: m.Admin })))
const PainelFinance = lazy(() =>
  import("@/pages/painel/Finance").then((m) => ({ default: m.PainelFinance })),
)

function RouteLoading() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  )
}

// OljrFinance é standalone: toda rota autenticada aterrissa no painel Finance.
// Não existe Hub de painéis nem roteamento por host — SEDUC vive no OljrSite.
function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/solicitar-acesso" element={<SolicitarAcesso />} />
        <Route path="/" element={<Navigate to="/painel/finance" replace />} />
        <Route
          path="/painel/finance"
          element={
            <RequireAuth>
              <PainelFinance />
            </RequireAuth>
          }
        />
        <Route
          path="/painel/:key"
          element={
            <RequireAuth>
              <Painel />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth admin>
              <Admin />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/painel/finance" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
