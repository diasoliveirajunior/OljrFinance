import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PaineisCheckboxes } from "@/components/admin/PaineisCheckboxes"
import { atualizarUsuario, papelCanonico } from "@/lib/rbac-api"
import type { UsuarioAdmin } from "@/lib/rbac-api"
import type { Permissao } from "@/lib/types"

const ADMIN_EMAIL = "diasoliveirajunior@gmail.com"

function toDateInput(v?: string | null): string {
  if (!v) return ""
  const d = new Date(v)
  if (isNaN(d.getTime())) return ""
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function EditarUsuarioDialog({
  u,
  size = "sm",
  variant = "outline",
  label = "Editar",
}: {
  u: UsuarioAdmin
  size?: "sm" | "default" | "lg" | "icon"
  variant?: "default" | "outline" | "ghost" | "secondary"
  label?: string
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [paineis, setPaineis] = useState<Permissao[]>(u.paineis ?? [])
  const [papel, setPapel] = useState(papelCanonico(u.papel))
  const [ativo, setAtivo] = useState(u.ativo)
  const [org, setOrg] = useState(u.org || u.instituicao || "")
  const [expiraEm, setExpiraEm] = useState(toDateInput(u.expira_em))
  const [erro, setErro] = useState<string | null>(null)

  const isOwner = u.email === ADMIN_EMAIL

  const mut = useMutation({
    mutationFn: () =>
      atualizarUsuario({
        email: u.email,
        papel,
        paineis,
        ativo,
        org: org.trim() || null,
        expira_em: papel === "convidado" && expiraEm ? new Date(expiraEm).toISOString() : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac"] })
      setOpen(false)
    },
    onError: (e) => setErro((e as Error).message),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setPaineis(u.paineis ?? [])
          setPapel(papelCanonico(u.papel))
          setAtivo(u.ativo)
          setOrg(u.org || u.instituicao || "")
          setExpiraEm(toDateInput(u.expira_em))
          setErro(null)
        }
      }}
    >
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>{u.email}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={ativo}
              onCheckedChange={(c) => setAtivo(c === true)}
            />
            Acesso ativo
          </label>
          <div className="grid gap-2">
            <Label>Painéis liberados</Label>
            <PaineisCheckboxes value={paineis} onChange={setPaineis} />
          </div>
          <div className="grid gap-2">
            <Label>Papel</Label>
            <Select value={papel} onValueChange={(v) => setPapel(v as typeof papel)} disabled={isOwner}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isOwner && <SelectItem value="CEO">CEO</SelectItem>}
                <SelectItem value="co_gestor">Co-gestor</SelectItem>
                <SelectItem value="membro">Membro</SelectItem>
                <SelectItem value="convidado">Convidado (acesso temporário)</SelectItem>
              </SelectContent>
            </Select>
            {isOwner && (
              <p className="text-[10px] text-muted-foreground leading-snug">
                O CEO dono do portal não pode ser rebaixado.
              </p>
            )}
          </div>
          {papel === "convidado" && (
            <div className="grid gap-2">
              <Label htmlFor="editar-expira">Expira em</Label>
              <input
                id="editar-expira"
                type="date"
                value={expiraEm}
                onChange={(e) => setExpiraEm(e.target.value)}
                className="h-9 rounded-md border px-3 text-sm bg-background"
              />
              <p className="text-[10px] text-muted-foreground leading-snug">
                Acesso é bloqueado automaticamente após esta data.
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="editar-org">Órgão / Instituição</Label>
            <input
              id="editar-org"
              type="text"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="SEDUC, PGE, Oliveira Junior..."
              className="h-9 rounded-md border px-3 text-sm bg-background"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
