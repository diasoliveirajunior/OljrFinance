import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth"
import { AccessGate } from "@/components/AccessGate"

export function RequireAuth({
  children,
  admin = false,
}: {
  children: ReactNode
  admin?: boolean
}) {
  const { firebaseUser, me, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
          <div className="border border-foreground px-3 py-1 text-sm font-light tracking-[2px] uppercase font-mono">
            OLJR.
          </div>
          <Loader2 className="size-6 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium">
              {window.location.hostname.toLowerCase() === "finance.oljr.com.br"
                ? "Preparando seu Finance"
                : "Preparando seu acesso"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Validando sua sessão com segurança…
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!me || me.status !== "ativo") {
    return <AccessGate />
  }

  if (admin && me.usuario?.papel !== "admin") {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
