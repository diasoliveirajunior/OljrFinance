import { useEffect, useRef } from "react"
import * as echarts from "echarts/core"
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts"
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import type { EChartsCoreOption, ECharts as ECInstance } from "echarts/core"
import { useTheme } from "@/hooks/useAppTheme"

// Registro único (tree-shaken). Adicionar charts/components aqui se precisar.
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  CanvasRenderer,
])

// Paleta profissional que funciona igual bem em light e dark mode.
// Ordem: cores mais neutras/frias primeiro, quentes depois.
const CHART_COLORS = [
  "#3B82F6", // azul
  "#10B981", // esmeralda
  "#F59E0B", // âmbar
  "#8B5CF6", // violeta
  "#F43F5E", // rosa/vermelho
  "#0EA5E9", // ciano
  "#F97316", // laranja
  "#64748B", // slate
  "#14B8A6", // teal
  "#EAB308", // amarelo dourado (não gritante)
  "#EC4899", // pink
  "#22C55E", // verde
]

// Cores do texto por tema, aplicadas em axisLabel/legend/tooltip
function themeTextColor(theme: "light" | "dark") {
  return theme === "dark" ? "#D4D4D8" : "#3F3F46"
}
function themeAxisLineColor(theme: "light" | "dark") {
  return theme === "dark" ? "#3F3F46" : "#E4E4E7"
}
function themeTooltipBg(theme: "light" | "dark") {
  return theme === "dark" ? "rgba(24,24,27,0.95)" : "rgba(255,255,255,0.97)"
}
function themeTooltipBorder(theme: "light" | "dark") {
  return theme === "dark" ? "#3F3F46" : "#D4D4D8"
}

export function ECharts({
  option,
  height = 280,
  onItemClick,
}: {
  option: EChartsCoreOption
  height?: number
  onItemClick?: (params: { name: string; value: unknown; dataIndex: number; seriesName?: string }) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<ECInstance | null>(null)
  const cbRef = useRef(onItemClick)
  useEffect(() => { cbRef.current = onItemClick }, [onItemClick])

  // Detecta tema atual (light/dark) — usado pra ajustar cor de eixos, tooltip, legend.
  const { theme } = useTheme()
  const resolvedTheme: "light" | "dark" = (theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme) as "light" | "dark"

  // mount + resize
  useEffect(() => {
    if (!ref.current) return
    inst.current = echarts.init(ref.current)
    const onResize = () => inst.current?.resize()
    window.addEventListener("resize", onResize)
    inst.current.on("click", (p: { name?: string; value?: unknown; dataIndex?: number; seriesName?: string }) => {
      if (!cbRef.current) return
      cbRef.current({
        name: String(p.name ?? ""),
        value: p.value,
        dataIndex: typeof p.dataIndex === "number" ? p.dataIndex : -1,
        seriesName: p.seriesName,
      })
    })
    return () => {
      window.removeEventListener("resize", onResize)
      inst.current?.dispose()
      inst.current = null
    }
  }, [])

  // sync option — injeta paleta + estilos de tema em cada option passada.
  useEffect(() => {
    if (!inst.current) return
    const txt = themeTextColor(resolvedTheme)
    const axisLine = themeAxisLineColor(resolvedTheme)
    const tooltipBg = themeTooltipBg(resolvedTheme)
    const tooltipBorder = themeTooltipBorder(resolvedTheme)
    const withTheme: EChartsCoreOption = {
      color: CHART_COLORS,
      textStyle: { color: txt, fontFamily: "inherit" },
      legend: {
        textStyle: { color: txt, fontSize: 11 },
        ...(option as Record<string, unknown>).legend as object,
      },
      tooltip: {
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 0.5,
        textStyle: { color: txt, fontSize: 12 },
        ...(option as Record<string, unknown>).tooltip as object,
      },
      ...option,
    }
    // Aplica cores nos eixos/axisLabel se existirem
    const axisDefaults = {
      axisLine: { lineStyle: { color: axisLine } },
      axisTick: { lineStyle: { color: axisLine } },
      splitLine: { lineStyle: { color: axisLine, opacity: 0.5 } },
      axisLabel: { color: txt, fontSize: 11 },
    }
    if ((withTheme as { xAxis?: unknown }).xAxis) {
      const x = (withTheme as { xAxis: unknown }).xAxis
      ;(withTheme as { xAxis: unknown }).xAxis = Array.isArray(x)
        ? x.map((axis) => ({ ...axisDefaults, ...(axis as object) }))
        : { ...axisDefaults, ...(x as object) }
    }
    if ((withTheme as { yAxis?: unknown }).yAxis) {
      const y = (withTheme as { yAxis: unknown }).yAxis
      ;(withTheme as { yAxis: unknown }).yAxis = Array.isArray(y)
        ? y.map((axis) => ({ ...axisDefaults, ...(axis as object) }))
        : { ...axisDefaults, ...(y as object) }
    }
    inst.current.setOption(withTheme, true)
  }, [option, resolvedTheme])

  // handle dynamic height changes
  useEffect(() => {
    inst.current?.resize()
  }, [height])

  return <div ref={ref} style={{ width: "100%", height }} />
}
