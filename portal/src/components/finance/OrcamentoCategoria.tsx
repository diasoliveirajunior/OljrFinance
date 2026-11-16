import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getOrcamento, getCategoriasMes, salvarOrcamento, fmtBRL } from "@/lib/finance-api"

export function OrcamentoCategoria({ categorias }: { categorias: string[] }) {
  const qc = useQueryClient()
  const [categoria, setCategoria] = useState(categorias[0] || "Outros")
  const [limite, setLimite] = useState("")

  const orcQ = useQuery({ queryKey: ["finance", "orcamento"], queryFn: getOrcamento })
  const catQ = useQuery({ queryKey: ["finance", "categorias-mes"], queryFn: getCategoriasMes })

  const salvar = useMutation({
    mutationFn: () => salvarOrcamento(categoria, Number(String(limite).replace(",", "."))),
    onSuccess: () => {
      setLimite("")
      qc.invalidateQueries({ queryKey: ["finance", "orcamento"] })
    },
  })

  const orcamento = orcQ.data?.orcamento ?? {}
  const gastoPorCat = new Map<string, number>()
  for (const c of catQ.data?.categorias ?? []) gastoPorCat.set(c.categoria, c.total)

  // Linhas a renderizar: todas com orçamento + as com gasto que ainda não têm orçamento.
  const todasCat = new Set([...Object.keys(orcamento), ...gastoPorCat.keys()])
  const linhas = [...todasCat]
    .map(c => ({
      categoria: c,
      limite: orcamento[c] || 0,
      gasto: gastoPorCat.get(c) || 0,
    }))
    .sort((a, b) => (b.limite || b.gasto) - (a.limite || a.gasto))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Orçamento por categoria</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col sm:flex-row gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (limite) salvar.mutate()
          }}
        >
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="h-9 sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Limite R$ (0 remove)"
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            className="flex-1 h-9 rounded-md border px-3 text-sm bg-background"
          />
          <Button type="submit" size="sm" disabled={salvar.isPending || !limite}>
            {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Salvar
          </Button>
        </form>

        {orcQ.isLoading || catQ.isLoading ? (
          <div className="flex justify-center p-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
        ) : linhas.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">
            Nenhuma categoria com orçamento ou gasto no mês.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {linhas.map((l) => {
              const semLimite = !l.limite
              const pct = l.limite > 0 ? Math.min(100, (l.gasto / l.limite) * 100) : 0
              const estouro = l.limite > 0 && l.gasto > l.limite
              const cor =
                semLimite ? "bg-zinc-400 dark:bg-zinc-600"
                : estouro ? "bg-red-500"
                : pct > 85 ? "bg-amber-500"
                : "bg-emerald-500"
              return (
                <div key={l.categoria}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium flex items-center gap-1">
                      {estouro && <AlertTriangle className="size-3 text-red-500" />}
                      {l.categoria}
                    </span>
                    <span className="text-muted-foreground">
                      {fmtBRL(l.gasto)}
                      {l.limite > 0 && ` / ${fmtBRL(l.limite)}`}
                      {l.limite > 0 && <span className="ml-1 font-mono">({pct.toFixed(0)}%)</span>}
                      {semLimite && <span className="ml-1 text-[10px]">(sem limite)</span>}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${cor}`} style={{ width: l.limite > 0 ? `${pct}%` : "100%" }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
