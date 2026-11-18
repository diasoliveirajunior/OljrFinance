import { useQuery } from "@tanstack/react-query"
import {
  Clock, CreditCard, Fuel, Landmark, LayoutDashboard, List, TrendingUp, Wallet,
} from "lucide-react"
import {
  fmtBRL, getCombustivel, getPatrimonio, listarCartoes, listarContas, listarInvestimentos,
  type PreferenciasPainel,
} from "@/lib/finance-api"

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

type Icon = typeof Wallet

interface AtalhoCard {
  chave: string
  titulo: string
  subtitulo?: string
  valor?: string
  icon: Icon
  cor: string
  acao: () => void
}

export function HomeFinance({
  primeiroNome, prefs, onIrPara,
}: {
  primeiroNome: string
  prefs: PreferenciasPainel | undefined
  onIrPara: (secao: "geral") => void
}) {
  const patQ = useQuery({ queryKey: ["finance", "patrimonio"], queryFn: getPatrimonio })
  const contasQ = useQuery({ queryKey: ["finance", "contas"], queryFn: listarContas })
  const cartoesQ = useQuery({ queryKey: ["finance", "cartoes"], queryFn: listarCartoes })
  const invQ = useQuery({ queryKey: ["finance", "investimentos"], queryFn: listarInvestimentos })
  const combQ = useQuery({ queryKey: ["finance", "combustivel"], queryFn: getCombustivel })

  const pat = patQ.data
  const contas = contasQ.data?.contas ?? []
  const cartoes = cartoesQ.data?.cartoes ?? []
  const invs = invQ.data?.investimentos ?? []
  const comb = combQ.data

  const mostrarCartoes = (prefs?.mostrar_cartoes !== false) && cartoes.length > 0
  const mostrarInvs = (prefs?.mostrar_investimentos !== false) && invs.length > 0
  const mostrarVeiculo = (prefs?.mostrar_veiculo !== false) && comb && comb.abastecimentos >= 1

  const atalhos: AtalhoCard[] = []
  atalhos.push({
    chave: "patrimonio", titulo: "Patrimônio total",
    subtitulo: pat ? `em ${contas.length} contas · ${invs.length} investimentos` : "carregando",
    valor: pat ? fmtBRL(pat.patrimonio_total) : "—",
    icon: Wallet, cor: "#10b981", acao: () => onIrPara("geral"),
  })
  atalhos.push({
    chave: "saldo", titulo: "Saldo nas contas",
    subtitulo: `${contas.length} ${contas.length === 1 ? "conta" : "contas"}`,
    valor: pat ? fmtBRL(pat.contas) : "—",
    icon: Landmark, cor: "#3b82f6", acao: () => onIrPara("geral"),
  })
  if (mostrarCartoes) atalhos.push({
    chave: "cartoes", titulo: "Fatura aberta",
    subtitulo: `${cartoes.length} ${cartoes.length === 1 ? "cartão" : "cartões"}`,
    valor: fmtBRL(cartoes.reduce((s, c) => s + c.fatura_atual, 0)),
    icon: CreditCard, cor: "#8b5cf6", acao: () => onIrPara("geral"),
  })
  if (mostrarInvs) atalhos.push({
    chave: "investimentos", titulo: "Investido",
    subtitulo: `${invs.length} ${invs.length === 1 ? "investimento" : "investimentos"}`,
    valor: pat ? fmtBRL(pat.investimentos) : "—",
    icon: TrendingUp, cor: "#f59e0b", acao: () => onIrPara("geral"),
  })
  atalhos.push({
    chave: "mes", titulo: "Saldo do mês",
    subtitulo: pat ? `${fmtBRL(pat.receita_mes)} − ${fmtBRL(pat.despesa_mes)}` : "—",
    valor: pat ? (pat.saldo_mes >= 0 ? "+ " : "- ") + fmtBRL(Math.abs(pat.saldo_mes)) : "—",
    icon: Clock, cor: pat && pat.saldo_mes >= 0 ? "#10b981" : "#ef4444",
    acao: () => onIrPara("geral"),
  })
  if (mostrarVeiculo && comb) atalhos.push({
    chave: "veiculo", titulo: "Consumo do veículo",
    subtitulo: comb.km_rodados_mes > 0 ? `${comb.km_rodados_mes.toLocaleString("pt-BR")} km no mês` : "atualizar odômetro",
    valor: comb.consumo_medio_km_l > 0 ? comb.consumo_medio_km_l.toFixed(1).replace(".", ",") + " km/l" : "—",
    icon: Fuel, cor: "#f97316", acao: () => onIrPara("geral"),
  })

  return (
    <div className="ff-home">
      <div className="ff-home-hero">
        <div className="ff-home-greet">
          <div className="ff-home-greet-label">{saudacao()},</div>
          <h1 className="ff-home-greet-name">{primeiroNome}</h1>
          <p className="ff-home-greet-sub">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
        </div>
      </div>

      <div className="ff-home-grid">
        {atalhos.map((a) => (
          <button key={a.chave} type="button" className="ff-home-card" onClick={a.acao}>
            <div className="ff-home-card-icon" style={{ background: a.cor + "22", color: a.cor }}>
              <a.icon className="size-5" />
            </div>
            <div className="ff-home-card-title">{a.titulo}</div>
            <div className="ff-home-card-value">{a.valor}</div>
            {a.subtitulo && <div className="ff-home-card-sub">{a.subtitulo}</div>}
          </button>
        ))}
      </div>

      <div className="ff-home-actions">
        <button className="ff-btn ff-btn--primary" onClick={() => onIrPara("geral")}>
          <LayoutDashboard className="size-4" /> Abrir visão geral completa
        </button>
      </div>

      <div className="ff-home-tip">
        <List className="size-4" />
        Toque em qualquer card acima ou use o menu lateral pra navegar.
      </div>
    </div>
  )
}
