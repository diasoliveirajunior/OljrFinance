import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EditarUsuarioDialog } from "@/components/admin/EditarUsuarioDialog"
import {
  listarUsuarios,
  atualizarUsuario,
  enviarSenhaUsuario,
  fmtData,
  papelCanonico,
  PAPEL_LABEL,
  nomeExibicao,
  CEO_EMAIL,
} from "@/lib/rbac-api"
import type { UsuarioAdmin } from "@/lib/rbac-api"

function ToggleAtivo({ u }: { u: UsuarioAdmin }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => atualizarUsuario({ email: u.email, ativo: !u.ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rbac"] }),
  })
  return (
    <Button
      size="sm"
      variant={u.ativo ? "ghost" : "default"}
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
    >
      {mut.isPending && <Loader2 className="size-4 animate-spin" />}
      {u.ativo ? "Bloquear" : "Ativar"}
    </Button>
  )
}

function ResetarSenhaButton({ u }: { u: UsuarioAdmin }) {
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState(false)

  async function handleSend() {
    setEnviando(true)
    setSucesso(false)
    try {
      await enviarSenhaUsuario(u.email)
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    } catch (e) {
      alert("Erro ao enviar e-mail: " + (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleSend}
      disabled={enviando}
      title="Enviar link para o usuário criar/redefinir a senha por e-mail"
    >
      {enviando ? (
        <Loader2 className="size-3 animate-spin" />
      ) : sucesso ? (
        "Enviado! ✔"
      ) : (
        "Enviar Senha"
      )}
    </Button>
  )
}

export function UsuariosTab() {
  const [busca, setBusca] = useState("")
  const [orgFiltro, setOrgFiltro] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["rbac", "usuarios"],
    queryFn: listarUsuarios,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Erro ao carregar usuários: {(error as Error).message}
        </AlertDescription>
      </Alert>
    )
  }

  const usuarios = data?.usuarios ?? []
  if (usuarios.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nenhum usuário cadastrado ainda.
      </p>
    )
  }

  // Contagem por órgão pros chips. Usa org || instituicao (fallback p/ cadastros antigos).
  const orgs = new Map<string, number>()
  for (const u of usuarios) {
    const o = (u.org || u.instituicao || "Sem órgão").trim()
    orgs.set(o, (orgs.get(o) || 0) + 1)
  }
  const orgList = [...orgs.entries()].sort((a, b) => b[1] - a[1])

  const q = busca.trim().toLowerCase()
  const filteredUsuarios = usuarios.filter((u) => {
    const orgU = (u.org || u.instituicao || "Sem órgão").trim()
    if (orgFiltro && orgU !== orgFiltro) return false
    if (!q) return true
    return (
      (u.email || "").toLowerCase().includes(q) ||
      (u.nome || "").toLowerCase().includes(q) ||
      orgU.toLowerCase().includes(q)
    )
  })

  const sortedUsuarios = [...filteredUsuarios].sort((a, b) =>
    nomeExibicao(a).localeCompare(nomeExibicao(b), "pt-BR")
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <input
          type="search"
          placeholder="Buscar por e-mail, nome ou órgão..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-9 rounded-md border px-3 text-sm bg-background"
        />
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={orgFiltro === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setOrgFiltro(null)}
          >
            Todos ({usuarios.length})
          </Badge>
          {orgList.map(([o, n]) => (
            <Badge
              key={o}
              variant={orgFiltro === o ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setOrgFiltro(orgFiltro === o ? null : o)}
            >
              {o} ({n})
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Exibindo {sortedUsuarios.length} de {usuarios.length}
        </p>
      </div>
      <div className="rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>E-mail</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Painéis</TableHead>
            <TableHead>Último acesso</TableHead>
            <TableHead className="text-center">Acessos</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedUsuarios.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <div className="font-medium">{u.email}</div>
                {(() => {
                  const nome = nomeExibicao(u)
                  const org = (u.org || u.instituicao || "").trim()
                  const mostraNome = nome !== u.email
                  if (!mostraNome && !org) return null
                  const primeiroNome = mostraNome ? nome.trim().split(/\s+/)[0] : ""
                  const sufixo = u.email === CEO_EMAIL ? " - CEO" : ""
                  return (
                    <div className="text-xs text-muted-foreground">
                      {primeiroNome}
                      {primeiroNome && org ? " - " : ""}
                      {org}
                      {sufixo}
                    </div>
                  )
                })()}
              </TableCell>
              <TableCell>
                <div className="text-sm">{PAPEL_LABEL[u.papel] || PAPEL_LABEL[papelCanonico(u.papel)]}</div>
                {u.expira_em && papelCanonico(u.papel) === "convidado" && (
                  <div className="text-[10px] text-muted-foreground">
                    expira {new Date(u.expira_em).toLocaleDateString("pt-BR")}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={u.ativo ? "default" : "secondary"}>
                  {u.ativo ? "Ativo" : "Bloqueado"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {(u.paineis ?? []).map((p) => (
                    <Badge key={p} variant="outline">
                      {p}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {fmtData(u.ultimo_acesso)}
              </TableCell>
              <TableCell className="text-sm font-semibold text-center">
                {u.acessos ?? 0}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <EditarUsuarioDialog u={u} />
                  <ToggleAtivo u={u} />
                  <ResetarSenhaButton u={u} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  )
}
