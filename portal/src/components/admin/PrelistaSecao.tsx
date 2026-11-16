import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Trash2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  listarPrelista,
  adicionarPrelista,
  removerPrelista,
  reenviarConvitePrelista,
  fmtData,
  CATEGORIA_LABEL,
} from "@/lib/rbac-api"
import type { CategoriaPrelista } from "@/lib/rbac-api"

export function PrelistaSecao({ categoria }: { categoria: CategoriaPrelista }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState("")
  const [nota, setNota] = useState("")
  const [enviarConvite, setEnviarConvite] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["rbac", "prelista", categoria],
    queryFn: () => listarPrelista(categoria),
  })

  const add = useMutation({
    mutationFn: () =>
      adicionarPrelista({
        email: email.trim().toLowerCase(),
        categoria,
        nota: nota.trim() || null,
        enviar_convite: enviarConvite,
      }),
    onSuccess: (res) => {
      setEmail("")
      setNota("")
      setErro(null)
      if (enviarConvite && res.conviteError) {
        setAviso(`E-mail adicionado, mas convite falhou: ${res.conviteError}`)
      } else if (enviarConvite && res.conviteEnviado) {
        setAviso("Convite enviado por e-mail.")
        setTimeout(() => setAviso(null), 4000)
      } else {
        setAviso(null)
      }
      qc.invalidateQueries({ queryKey: ["rbac", "prelista", categoria] })
    },
    onError: (e) => setErro((e as Error).message),
  })

  const rem = useMutation({
    mutationFn: (alvo: string) => removerPrelista(alvo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rbac", "prelista", categoria] }),
  })

  const reenviar = useMutation({
    mutationFn: (alvo: string) => reenviarConvitePrelista(alvo),
    onSuccess: () => {
      setAviso("Convite reenviado.")
      setTimeout(() => setAviso(null), 4000)
    },
    onError: (e) => setAviso(`Falha ao reenviar: ${(e as Error).message}`),
  })

  const itens = data?.prelista ?? []

  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-semibold">Pré-cadastro de e-mails</div>
          <div className="text-xs text-muted-foreground">
            Só e-mails desta lista podem se cadastrar como {CATEGORIA_LABEL[categoria]}.
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {itens.length} {itens.length === 1 ? "e-mail" : "e-mails"}
        </div>
      </div>

      <form
        className="flex flex-col sm:flex-row gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <input
          type="email"
          required
          placeholder="email@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 h-9 rounded-md border px-3 text-sm bg-background"
        />
        <input
          type="text"
          placeholder="Nota (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="flex-1 h-9 rounded-md border px-3 text-sm bg-background"
          maxLength={200}
        />
        <Button type="submit" size="sm" disabled={add.isPending || !email}>
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Adicionar
        </Button>
      </form>

      <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3 cursor-pointer select-none">
        <Checkbox
          checked={enviarConvite}
          onCheckedChange={(c) => setEnviarConvite(c === true)}
        />
        Enviar convite por e-mail ao adicionar
      </label>

      {erro && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {aviso && (
        <Alert className="mb-3">
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex justify-center p-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : itens.length === 0 ? (
        <p className="text-xs text-muted-foreground p-2">
          Nenhum e-mail pré-cadastrado nesta categoria ainda.
        </p>
      ) : (
        <div className="flex flex-col divide-y">
          {itens.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{p.email}</div>
                <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
                  {p.nota && <span>{p.nota}</span>}
                  <span>Adicionado em {fmtData(p.adicionado_em)}</span>
                  {p.adicionado_por && <span>por {p.adicionado_por}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => reenviar.mutate(p.email)}
                  disabled={reenviar.isPending}
                  title="Reenviar convite por e-mail"
                >
                  {reenviar.isPending && reenviar.variables === p.email ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Mail className="size-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => rem.mutate(p.email)}
                  disabled={rem.isPending}
                  title="Remover da pré-lista"
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
