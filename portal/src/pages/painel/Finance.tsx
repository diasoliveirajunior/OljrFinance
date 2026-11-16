import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Cloud, FileInput, LayoutDashboard, List, LogOut, Loader2, Plus, Settings2, Trash2, Wallet, TrendingUp, TrendingDown, PiggyBank } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ModeToggle } from "@/components/mode-toggle"
import { GraficoMensal } from "@/components/finance/GraficoMensal"
import { OrcamentoCategoria } from "@/components/finance/OrcamentoCategoria"
import { ImportarExtrato } from "@/components/finance/ImportarExtrato"
import { SincronizarDrive } from "@/components/finance/SincronizarDrive"
import { MascoteFinance, PersonalizacaoFinance } from "@/components/finance/PersonalizacaoFinance"
import { PainelFinanceLateral } from "@/components/finance/PainelFinanceLateral"
import { useAuth } from "@/contexts/auth"
import {
  listarLancamentos,
  adicionarLancamento,
  removerLancamento,
  getResumo,
  getFinancePreferencias,
  fmtBRL,
  fmtData,
} from "@/lib/finance-api"
import type { TipoLancamento } from "@/lib/finance-api"

function hojeISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function Kpi({
  label,
  valor,
  hint,
  Icon,
  tone,
}: {
  label: string
  valor: string
  hint?: string
  Icon: typeof Wallet
  tone?: "default" | "success" | "danger" | "accent"
}) {
  const toneClass =
    tone === "success" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "danger" ? "text-red-600 dark:text-red-400"
    : tone === "accent" ? "text-blue-600 dark:text-blue-400"
    : "text-foreground"
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span>{label}</span>
          <Icon className="size-4 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-semibold ${toneClass}`}>{valor}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function NovoLancamento({ categorias }: { categorias: string[] }) {
  const qc = useQueryClient()
  const [data, setData] = useState(hojeISO())
  const [descricao, setDescricao] = useState("")
  const [categoria, setCategoria] = useState(categorias[0] || "Outros")
  const [valor, setValor] = useState("")
  const [tipo, setTipo] = useState<TipoLancamento>("despesa")
  const [erro, setErro] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () =>
      adicionarLancamento({
        data,
        descricao,
        categoria,
        valor: Number(String(valor).replace(",", ".")),
        tipo,
      }),
    onSuccess: () => {
      setDescricao("")
      setValor("")
      setErro(null)
      qc.invalidateQueries({ queryKey: ["finance"] })
    },
    onError: (e) => setErro((e as Error).message),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Plus className="size-4" /> Novo lançamento
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-[120px_1fr_140px_140px_120px_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            mut.mutate()
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="lanc-data" className="text-[10px]">Data</Label>
            <input
              id="lanc-data"
              type="date"
              required
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="h-9 rounded-md border px-3 text-sm bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lanc-desc" className="text-[10px]">Descrição</Label>
            <input
              id="lanc-desc"
              type="text"
              required
              placeholder="Supermercado, Salário..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="h-9 rounded-md border px-3 text-sm bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[10px]">Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[10px]">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoLancamento)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="despesa">Despesa</SelectItem>
                <SelectItem value="receita">Receita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lanc-valor" className="text-[10px]">Valor (R$)</Label>
            <input
              id="lanc-valor"
              type="text"
              required
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="h-9 rounded-md border px-3 text-sm bg-background"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={mut.isPending || !descricao || !valor}>
              {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Adicionar
            </Button>
          </div>
          {erro && (
            <Alert variant="destructive" className="sm:col-span-6">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

export function PainelFinance() {
  const navigate = useNavigate()
  const { me, logout } = useAuth()
  const qc = useQueryClient()
  const [secao, setSecao] = useState<"visao" | "lancamentos" | "importar" | "nuvens" | "companheiro">("visao")

  const resumoQ = useQuery({ queryKey: ["finance", "resumo"], queryFn: getResumo })
  const preferenciasQ = useQuery({
    queryKey: ["finance", "preferencias"],
    queryFn: getFinancePreferencias,
  })
  const lancQ = useQuery({
    queryKey: ["finance", "lancamentos"],
    queryFn: () => listarLancamentos({ limit: 200 }),
  })

  const removeMut = useMutation({
    mutationFn: (id: string) => removerLancamento(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  })

  const r = resumoQ.data
  const categorias = r?.categorias_default ?? ["Outros"]
  const lancamentos = [...(lancQ.data?.lancamentos ?? [])]
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
  const preferencias = preferenciasQ.data ?? {
    mascote: "gato" as const,
    layout: "confortavel" as const,
    animacoes: true,
  }

  const isOwner = me?.email?.toLowerCase() === "diasoliveirajunior@gmail.com"
  const subtitle = isOwner
    ? "Oliveira Junior · CEO"
    : me?.usuario?.nome || me?.email

  return (
    <div className={`min-h-svh bg-muted/30 finance-layout finance-layout--${preferencias.layout}`}>
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1400px] w-full items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="border border-foreground px-3 py-1 text-sm font-light tracking-[2px] uppercase font-mono">
              OLJR.
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight leading-none flex items-center gap-2">
                <Wallet className="size-4" /> Finance
              </h1>
              <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="size-4" />
              {window.location.hostname.toLowerCase() === "finance.oljr.com.br" ? "Início" : "Hub"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              <LogOut className="size-4" /> Sair
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>

      <nav className="finance-section-nav" aria-label="Menu Finance">
        {([
          ["visao", "Visão geral", LayoutDashboard],
          ["lancamentos", "Lançamentos", List],
          ["importar", "Importar extrato", FileInput],
          ["nuvens", "Conexões na nuvem", Cloud],
          ["companheiro", "Companheiro", Settings2],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setSecao(id)} className={secao === id ? "is-active" : ""}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      <main className="finance-main mx-auto max-w-[1500px] w-full p-6 flex flex-col gap-5">
        {secao === "visao" && <div className="finance-dashboard-grid">
          <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Visão do mês</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Seu dinheiro em um só lugar</h2>
          </div>
          <MascoteFinance preferencias={preferencias} resumo={r} />
        </div>
        {resumoQ.isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : resumoQ.error ? (
          <Alert variant="destructive">
            <AlertDescription>Erro ao carregar resumo: {(resumoQ.error as Error).message}</AlertDescription>
          </Alert>
        ) : r && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Saldo" valor={fmtBRL(r.saldo)} hint="histórico" Icon={Wallet} tone={r.saldo >= 0 ? "success" : "danger"} />
            <Kpi label="Receitas mês" valor={fmtBRL(r.receita_mes)} hint={`${r.qtd_receita_mes} lançamentos`} Icon={TrendingUp} tone="success" />
            <Kpi label="Despesas mês" valor={fmtBRL(r.despesa_mes)} hint={`${r.qtd_despesa_mes} lançamentos`} Icon={TrendingDown} tone="danger" />
            <Kpi label="Taxa poupança" valor={r.taxa_poupanca.toFixed(1) + "%"} hint={`meta 30%`} Icon={PiggyBank} tone={r.taxa_poupanca >= 30 ? "success" : "accent"} />
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-5">
          <GraficoMensal meses={6} preferencias={preferencias} />
          <OrcamentoCategoria categorias={categorias} />
        </div>
          </div>
          <PainelFinanceLateral lancamentos={lancamentos} />
        </div>}

        {secao === "lancamentos" && <>
        <NovoLancamento categorias={categorias} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Últimos lançamentos</span>
              <Badge variant="outline">{lancamentos.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lancQ.isLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : lancamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">
                Nenhum lançamento ainda. Use o formulário acima pra registrar o primeiro.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground">{fmtData(l.data)}</TableCell>
                      <TableCell className="text-sm font-medium">{l.descricao}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">{l.categoria}</Badge>
                          {l.origem === "ofx" && (
                            <Badge variant="secondary" className="text-[9px]" title="Importado via extrato OFX">OFX</Badge>
                          )}
                          {l.origem === "drive_xlsx" && (
                            <Badge variant="secondary" className="text-[9px]" title="Sincronizado do Google Drive">Drive</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${l.tipo === "receita" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {l.tipo === "receita" ? "+" : "−"}{fmtBRL(l.valor)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeMut.mutate(l.id)}
                          disabled={removeMut.isPending}
                          title="Apagar lançamento"
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        </>}

        {secao === "importar" && <ImportarExtrato />}
        {secao === "nuvens" && <SincronizarDrive />}
        {secao === "companheiro" && <div className="finance-section-content">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Preferências</p><h2 className="mt-1 text-2xl font-semibold">Companheiro financeiro</h2></div>
            <MascoteFinance preferencias={preferencias} resumo={r} />
          </div>
          <PersonalizacaoFinance preferencias={preferencias} />
        </div>}

        <p className="text-xs text-muted-foreground text-center">
          v1 manual. Importação automática (CSV/Pluggy/PDF) e gráficos vêm nas próximas fases.
        </p>
      </main>
    </div>
  )
}
