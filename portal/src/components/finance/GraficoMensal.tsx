import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, MousePointerClick } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ECharts } from "@/components/ECharts"
import { getSerieMensal, fmtMes, fmtBRL } from "@/lib/finance-api"
import type { FinancePreferencias } from "@/lib/finance-api"

const MASCOTE_EMOJI = {
  gato: "🐱",
  cachorro: "🐶",
  urso: "🐻",
  macaco: "🐵",
  nenhum: "",
} as const

export function GraficoMensal({
  meses = 6,
  preferencias,
}: {
  meses?: number
  preferencias?: FinancePreferencias
}) {
  const [mesAtivo, setMesAtivo] = useState(0)
  const { data, isLoading, error } = useQuery({
    queryKey: ["finance", "serie", meses],
    queryFn: () => getSerieMensal(meses),
  })
  const serie = data?.serie ?? []

  useEffect(() => {
    if (!preferencias?.animacoes || preferencias.mascote === "nenhum" || serie.length < 2) return
    const timer = window.setInterval(() => {
      setMesAtivo((atual) => (atual + 1) % serie.length)
    }, 2800)
    return () => window.clearInterval(timer)
  }, [preferencias?.animacoes, preferencias?.mascote, serie.length])

  const opt = useMemo(() => ({
    grid: { left: 50, right: 16, top: 20, bottom: 28 },
    tooltip: {
      trigger: "axis",
      formatter: (params: { name: string; seriesName: string; value: number }[]) => {
        const lines = params.map((p) => `${p.seriesName}: ${fmtBRL(p.value)}`).join("<br/>")
        return `<b>${params[0].name}</b><br/>${lines}`
      },
    },
    legend: { data: ["Receita", "Despesa"], textStyle: { fontSize: 11 } },
    xAxis: {
      type: "category",
      data: serie.map((p) => fmtMes(p.mes)),
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        fontSize: 10,
        formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v),
      },
    },
    series: [
      {
        name: "Receita", type: "bar", data: serie.map((p) => p.receita),
        itemStyle: { color: "#10b981", borderRadius: [7, 7, 2, 2] },
        emphasis: { focus: "series" },
      },
      {
        name: "Despesa", type: "bar", data: serie.map((p) => p.despesa),
        itemStyle: { color: "#f43f5e", borderRadius: [7, 7, 2, 2] },
        emphasis: { focus: "series" },
      },
    ],
  }), [serie])

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Evolução mensal</CardTitle></CardHeader>
        <CardContent className="flex justify-center p-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Evolução mensal</CardTitle></CardHeader>
        <CardContent className="p-4 text-sm text-muted-foreground">Erro ao carregar gráfico.</CardContent>
      </Card>
    )
  }

  const ponto = serie[mesAtivo] || serie[0]
  const maiorValor = Math.max(1, ...serie.flatMap((p) => [p.receita, p.despesa]))
  const leftPct = serie.length <= 1 ? 50 : 9 + (mesAtivo / (serie.length - 1)) * 84
  const topPct = ponto ? 17 + (1 - Math.max(ponto.receita, ponto.despesa) / maiorValor) * 48 : 55
  const saldoMes = ponto ? ponto.receita - ponto.despesa : 0

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20 pb-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold">Evolução mensal · últimos {meses} meses</CardTitle>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <MousePointerClick className="size-3" /> Clique em uma barra para chamar o mascote
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="finance-chart-stage">
          <ECharts
            option={opt}
            height={260}
            onItemClick={(item) => item.dataIndex >= 0 && setMesAtivo(item.dataIndex)}
          />
          {preferencias && preferencias.mascote !== "nenhum" && ponto && (
            <div
              className={`finance-chart-mascot ${preferencias.animacoes ? "is-animated" : ""}`}
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              aria-label={`Mascote no mês ${fmtMes(ponto.mes)}`}
            >
              <span>{MASCOTE_EMOJI[preferencias.mascote]}</span>
              <div className="finance-chart-mascot__bubble">
                <strong>{fmtMes(ponto.mes)}</strong>
                <small className={saldoMes >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {saldoMes >= 0 ? "Sobrou " : "Faltou "}{fmtBRL(Math.abs(saldoMes))}
                </small>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
