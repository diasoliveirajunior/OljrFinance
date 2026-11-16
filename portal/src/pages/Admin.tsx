import { useNavigate } from "react-router-dom"
import { ArrowLeft, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/auth"
import { SolicitacoesTab } from "@/pages/admin/SolicitacoesTab"
import { UsuariosTab } from "@/pages/admin/UsuariosTab"
import { EquipeTab } from "@/pages/admin/EquipeTab"
import { LogsTab } from "@/pages/admin/LogsTab"
import { ModeToggle } from "@/components/mode-toggle"

export function Admin() {
  const { me, logout } = useAuth()
  const navigate = useNavigate()

  const isOwner = me?.email?.toLowerCase() === "diasoliveirajunior@gmail.com"
  const profileName = isOwner
    ? "Oliveira Junior"
    : me?.usuario?.nome
    ? me.usuario.nome.trim().split(/\s+/)[0]
    : ""
  const profileRole = isOwner
    ? "CEO"
    : me?.usuario?.papel === "admin"
    ? "Administrador"
    : me?.usuario?.vinculo === "publico"
    ? (me?.usuario?.instituicao ? `Gestor Público · ${me.usuario.instituicao}` : "Gestor Público")
    : me?.usuario?.vinculo === "privado"
    ? (me?.usuario?.instituicao ? `Empresa · ${me.usuario.instituicao}` : "Empresa")
    : me?.usuario?.vinculo === "particular"
    ? "Particular"
    : me?.usuario?.vinculo === "ceo"
    ? "CEO"
    : me?.usuario?.papel
    ? me.usuario.papel.charAt(0).toUpperCase() + me.usuario.papel.slice(1)
    : ""

  const subtitle = profileName
    ? `${profileName}${profileRole ? ` · ${profileRole}` : ""}`
    : me?.email

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1600px] w-full flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="border border-foreground px-3 py-1 text-sm font-light tracking-[2px] uppercase font-mono">
              OLJR.
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight leading-none">
                Administração
              </h1>
              <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button variant="outline" size="sm" onClick={() => navigate("/painel/finance")}>
              <ArrowLeft className="size-4" /> Painel
            </Button>
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              <LogOut className="size-4" /> Sair
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] w-full p-6">
        <Tabs defaultValue="solicitacoes">
          <TabsList>
            <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
            <TabsTrigger value="usuarios">Usuários</TabsTrigger>
            <TabsTrigger value="equipe">Equipe</TabsTrigger>
            <TabsTrigger value="logs">Logs de acesso</TabsTrigger>
          </TabsList>
          <TabsContent value="solicitacoes" className="mt-4">
            <SolicitacoesTab />
          </TabsContent>
          <TabsContent value="usuarios" className="mt-4">
            <UsuariosTab />
          </TabsContent>
          <TabsContent value="equipe" className="mt-4">
            <EquipeTab />
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <LogsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
