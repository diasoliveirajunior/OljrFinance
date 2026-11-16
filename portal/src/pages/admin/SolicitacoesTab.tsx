import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PaineisCheckboxes } from "@/components/admin/PaineisCheckboxes"
import {
  listarSolicitacoes,
  decidirSolicitacao,
  fmtData,
} from "@/lib/rbac-api"
import type { Solicitacao } from "@/lib/rbac-api"
import type { Permissao } from "@/lib/types"

function AprovarDialog({ sol }: { sol: Solicitacao }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [paineis, setPaineis] = useState<Permissao[]>([])
  const [papel, setPapel] = useState("membro")
  const [expiraEm, setExpiraEm] = useState("")
  const [link, setLink] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () =>
      decidirSolicitacao({
        email: sol.email,
        decisao: "aprovar",
        papel,
        paineis,
        expira_em: papel === "convidado" && expiraEm ? new Date(expiraEm).toISOString() : null,
      }),
    onSuccess: (res) => {
      // Não invalida aqui: isso esvaziaria a lista e desmontaria o diálogo
      // antes de mostrar o link. A invalidação acontece ao fechar o diálogo.
      if (res.activationError) {
        setAviso(
          "Usuário aprovado, mas não consegui gerar o link de ativação: " +
            res.activationError,
        )
      }
      if (res.activationLink) {
        setLink(res.activationLink)
      } else if (!res.activationError) {
        setOpen(false)
      }
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setLink(null)
          setAviso(null)
          qc.invalidateQueries({ queryKey: ["rbac"] })
        }
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        <Check className="size-4" /> Aprovar
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar acesso</DialogTitle>
          <DialogDescription>{sol.email}</DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="flex flex-col gap-3">
            <Alert>
              <AlertDescription>
                Acesso liberado. Envie este link para a pessoa definir a senha
                (válido por tempo limitado):
              </AlertDescription>
            </Alert>
            <textarea
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="h-24 w-full rounded-md border p-2 text-xs"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {aviso && (
              <Alert variant="destructive">
                <AlertDescription>{aviso}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label>Painéis liberados</Label>
              <PaineisCheckboxes value={paineis} onChange={setPaineis} />
            </div>
            <div className="grid gap-2">
              <Label>Papel</Label>
              <Select value={papel} onValueChange={setPapel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="co_gestor">Co-gestor</SelectItem>
                  <SelectItem value="membro">Membro</SelectItem>
                  <SelectItem value="convidado">Convidado (acesso temporário)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground leading-snug">
                CEO é exclusivo do dono e atribuído automaticamente.
              </p>
            </div>
            {papel === "convidado" && (
              <div className="grid gap-2">
                <Label htmlFor="aprovar-expira">Expira em</Label>
                <input
                  id="aprovar-expira"
                  type="date"
                  value={expiraEm}
                  onChange={(e) => setExpiraEm(e.target.value)}
                  className="h-9 rounded-md border px-3 text-sm bg-background"
                />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Após esta data, o acesso é bloqueado automaticamente no próximo login.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {link ? (
            <Button onClick={() => setOpen(false)}>Concluir</Button>
          ) : (
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="size-4 animate-spin" />}
              Confirmar aprovação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejeitarButton({ sol }: { sol: Solicitacao }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () =>
      decidirSolicitacao({ email: sol.email, decisao: "rejeitar" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rbac"] }),
  })
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
    >
      {mut.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <X className="size-4" />
      )}{" "}
      Rejeitar
    </Button>
  )
}

export function SolicitacoesTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["rbac", "solicitacoes"],
    queryFn: () => listarSolicitacoes("pendente"),
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
          Erro ao carregar solicitações: {(error as Error).message}
        </AlertDescription>
      </Alert>
    )
  }

  const itens = data?.solicitacoes ?? []
  if (itens.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nenhuma solicitação pendente.
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {itens.map((sol) => (
        <Card key={sol.id}>
          <CardHeader>
            <CardTitle className="text-base">{sol.nome || sol.email}</CardTitle>
            <CardDescription>{sol.email}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="text-muted-foreground">
              {sol.vinculo && <div>Vínculo: {sol.vinculo}</div>}
              {sol.instituicao && <div>Instituição: {sol.instituicao}</div>}
              {sol.mensagem && <div>Mensagem: {sol.mensagem}</div>}
              <div>Solicitado em: {fmtData(sol.criado_em)}</div>
            </div>
            <div className="flex gap-2">
              <AprovarDialog sol={sol} />
              <RejeitarButton sol={sol} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
