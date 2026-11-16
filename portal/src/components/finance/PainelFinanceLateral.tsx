import { useEffect, useMemo, useState } from "react"
import { Activity, ArrowDownRight, ArrowUpRight, ReceiptText } from "lucide-react"
import { fmtBRL, fmtData, type Lancamento } from "@/lib/finance-api"

const ROTATE_MS = 7000
const PER_PAGE = 3

export function PainelFinanceLateral({ lancamentos }: { lancamentos: Lancamento[] }) {
  const [page, setPage] = useState(0)
  const recentes = useMemo(() => [...lancamentos]
    .sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 18), [lancamentos])
  const pages = Math.max(1, Math.ceil(recentes.length / PER_PAGE))
  useEffect(() => {
    if (pages <= 1) return
    const timer = window.setInterval(() => setPage((value) => (value + 1) % pages), ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [pages])
  const visiveis = recentes.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  return <aside className="finance-summary-panel">
    <div className="flex items-center gap-2"><ReceiptText className="size-4 text-emerald-500" /><div><p className="text-sm font-semibold">Pulso financeiro</p><p className="text-[10px] text-muted-foreground">Movimentações mais recentes</p></div></div>
    <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground"><span>{page + 1}/{pages}</span><div className="flex gap-1">{Array.from({ length: Math.min(pages, 8) }).map((_, index) => <span key={index} className={`size-1 rounded-full ${index === page ? "bg-emerald-500" : "bg-muted-foreground/35"}`} />)}</div></div>
    <div key={page} className="mt-3 space-y-2 finance-summary-panel__items">{visiveis.length ? visiveis.map((item) => {
      const receita = item.tipo === "receita"; const Icon = receita ? ArrowUpRight : ArrowDownRight
      return <div key={item.id} className={`rounded-lg border-l-2 p-3 ${receita ? "border-emerald-500 bg-emerald-500/5" : "border-rose-500 bg-rose-500/5"}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-semibold">{item.descricao}</p><p className="mt-1 text-[10px] text-muted-foreground">{fmtData(item.data)} · {item.categoria}</p></div><Icon className={`size-4 shrink-0 ${receita ? "text-emerald-500" : "text-rose-500"}`} /></div><p className={`mt-2 text-sm font-semibold ${receita ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{receita ? "+" : "−"}{fmtBRL(item.valor)}</p></div>
    }) : <div className="py-8 text-center text-xs text-muted-foreground"><Activity className="mx-auto mb-2 size-4" />Sem movimentações.</div>}</div>
    <p className="mt-auto border-t pt-3 text-center text-[10px] text-muted-foreground">OLJR Finance</p>
  </aside>
}
