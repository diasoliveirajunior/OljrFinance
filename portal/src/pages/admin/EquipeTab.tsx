import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EditarUsuarioDialog } from "@/components/admin/EditarUsuarioDialog"
import { PrelistaSecao } from "@/components/admin/PrelistaSecao"
import {
  listarUsuarios,
  fmtData,
  papelCanonico,
  PAPEL_LABEL,
  nomeExibicao,
  CEO_EMAIL,
} from "@/lib/rbac-api"
import type { UsuarioAdmin, CategoriaPrelista } from "@/lib/rbac-api"

type Categoria = "oljr" | "publico" | "privado" | "particular"

const ORG_EQUIPE_OLJR = "Equipe Oliveira Junior - OlJr"
const ORG_CEO = "Oliveira Junior"

function categoriaDe(u: UsuarioAdmin): Categoria {
  const v = String(u.vinculo || "").toLowerCase()
  const org = String(u.org || u.instituicao || "").trim()

  // CEO dono é sempre OlJr.
  if (u.email === CEO_EMAIL) return "oljr"

  // Vínculo declarado tem prioridade.
  if (v === "ceo" || v === "equipe_oljr") return "oljr"
  if (v === "publico") return "publico"
  if (v === "privado") return "privado"
  if (v === "particular") return "particular"

  // Fallback p/ legados sem vínculo: usa o org.
  if (org === ORG_CEO || org === ORG_EQUIPE_OLJR) return "oljr"
  if (org === "Particular") return "particular"

  // Default conservador: OlJr (são poucos, fácil de re-classificar manualmente).
  return "oljr"
}

// Org pra exibir nos cards.
//   - na sub-aba OlJr: CEO fica num card próprio ("Oliveira Junior");
//     equipe é agrupada por PAPEL (Co-gestores num card, Membros em outro, Convidados em outro).
//     Quando todos os não-CEO têm o mesmo papel, fica 1 card só.
//   - nas demais categorias: usa o org declarado; vazio = "Sem órgão" (sinaliza cadastro incompleto).
const PAPEL_PLURAL: Record<string, string> = {
  CEO: "Oliveira Junior",
  co_gestor: "Equipe Oliveira Junior - OlJr",
  membro: "Equipe Oliveira Junior - Membros",
  convidado: "Equipe Oliveira Junior - Convidados",
}

function orgDe(u: UsuarioAdmin, cat?: Categoria): string {
  if (cat === "oljr") {
    if (u.email === CEO_EMAIL) return ORG_CEO
    const papel = papelCanonico(u.papel)
    return PAPEL_PLURAL[papel] || ORG_EQUIPE_OLJR
  }
  const raw = (u.org || u.instituicao || "").trim()
  if (raw) return raw
  return "Sem órgão"
}

// Card de um órgão (lista de pessoas dele).
function OrgCard({
  org,
  lista,
  isCEOGroup,
}: {
  org: string
  lista: UsuarioAdmin[]
  isCEOGroup?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            {org}
          </span>
          <Badge variant={isCEOGroup ? "default" : "secondary"}>{lista.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0">
        {lista
          .slice()
          .sort((a, b) => {
            // CEO (dono do portal) sempre no topo do card.
            if (a.email === CEO_EMAIL) return -1
            if (b.email === CEO_EMAIL) return 1
            return nomeExibicao(a).localeCompare(nomeExibicao(b), "pt-BR")
          })
          .map((u) => {
            const papel = papelCanonico(u.papel)
            const isCEO = u.email === CEO_EMAIL
            return (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 border-b last:border-b-0 pb-2 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{nomeExibicao(u)}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Último acesso: {fmtData(u.ultimo_acesso)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={isCEO ? "default" : "outline"} className="text-[10px]">
                    {PAPEL_LABEL[u.papel] || PAPEL_LABEL[papel]}
                  </Badge>
                  {!u.ativo && (
                    <Badge variant="secondary" className="text-[10px]">Bloqueado</Badge>
                  )}
                  {u.expira_em && papel === "convidado" && (
                    <span className="text-[9px] text-muted-foreground">
                      expira {new Date(u.expira_em).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                  <EditarUsuarioDialog u={u} size="sm" variant="ghost" label="Editar" />
                </div>
              </div>
            )
          })}
      </CardContent>
    </Card>
  )
}

// Sub-aba: filtra por categoria, agrupa por org, mostra prelista se aplicável.
function SecaoCategoria({
  usuarios,
  categoria,
  prelistaCat,
  busca,
}: {
  usuarios: UsuarioAdmin[]
  categoria: Categoria
  prelistaCat?: CategoriaPrelista
  busca: string
}) {
  const q = busca.trim().toLowerCase()
  const filtrados = usuarios.filter((u) => {
    if (categoriaDe(u) !== categoria) return false
    if (!q) return true
    const orgU = orgDe(u, categoria)
    return (
      (u.email || "").toLowerCase().includes(q) ||
      (u.nome || "").toLowerCase().includes(q) ||
      orgU.toLowerCase().includes(q)
    )
  })

  // Agrupa por org. CEO sempre primeiro; depois os outros por contagem desc.
  const grupos = new Map<string, UsuarioAdmin[]>()
  for (const u of filtrados) {
    const o = orgDe(u, categoria)
    if (!grupos.has(o)) grupos.set(o, [])
    grupos.get(o)!.push(u)
  }

  const ordenado = [...grupos.entries()].sort((a, b) => {
    if (a[0] === ORG_CEO) return -1
    if (b[0] === ORG_CEO) return 1
    return b[1].length - a[1].length
  })

  return (
    <div className="flex flex-col gap-4">
      {prelistaCat && <PrelistaSecao categoria={prelistaCat} />}

      {ordenado.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 border rounded-md bg-card/30">
          Nenhum usuário ativo nesta categoria{busca ? " com este filtro" : ""}.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ordenado.map(([org, lista]) => (
            <OrgCard key={org} org={org} lista={lista} isCEOGroup={org === ORG_CEO} />
          ))}
        </div>
      )}
    </div>
  )
}

export function EquipeTab() {
  const [busca, setBusca] = useState("")

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
          Erro ao carregar equipe: {(error as Error).message}
        </AlertDescription>
      </Alert>
    )
  }

  const usuarios = data?.usuarios ?? []

  // Contagem por categoria pra mostrar nos badges das abas.
  const counts: Record<Categoria, number> = { oljr: 0, publico: 0, privado: 0, particular: 0 }
  for (const u of usuarios) counts[categoriaDe(u)]++

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        placeholder="Buscar por e-mail, nome ou órgão..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="h-9 rounded-md border px-3 text-sm bg-background"
      />

      <Tabs defaultValue="oljr">
        <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-4">
          <TabsTrigger value="oljr">
            CEO / Equipe OlJr <Badge variant="secondary" className="ml-1.5 h-4 text-[10px]">{counts.oljr}</Badge>
          </TabsTrigger>
          <TabsTrigger value="publico">
            Órgãos Públicos <Badge variant="secondary" className="ml-1.5 h-4 text-[10px]">{counts.publico}</Badge>
          </TabsTrigger>
          <TabsTrigger value="privado">
            Empresas Privadas <Badge variant="secondary" className="ml-1.5 h-4 text-[10px]">{counts.privado}</Badge>
          </TabsTrigger>
          <TabsTrigger value="particular">
            Particulares <Badge variant="secondary" className="ml-1.5 h-4 text-[10px]">{counts.particular}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="oljr" className="mt-3">
          <SecaoCategoria
            usuarios={usuarios}
            categoria="oljr"
            prelistaCat="equipe_oljr"
            busca={busca}
          />
        </TabsContent>
        <TabsContent value="publico" className="mt-3">
          <SecaoCategoria usuarios={usuarios} categoria="publico" busca={busca} />
        </TabsContent>
        <TabsContent value="privado" className="mt-3">
          <SecaoCategoria
            usuarios={usuarios}
            categoria="privado"
            prelistaCat="privado"
            busca={busca}
          />
        </TabsContent>
        <TabsContent value="particular" className="mt-3">
          <SecaoCategoria
            usuarios={usuarios}
            categoria="particular"
            prelistaCat="particular"
            busca={busca}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
