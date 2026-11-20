import { AlertCircle, CheckCircle2, FileText } from "lucide-react"
import { fmtBRL, type Conta } from "@/lib/finance-api"
const day = (value?: string | null) => value ? value.split("-").reverse().join("/") : "Sem data"
const labels = { conferido: "Histórico conferido", divergente: "Histórico com diferenças", incompleto: "Conferência incompleta", conflito: "Saldos conflitantes", sem_extrato: "Sem saldo de extrato" }

export function AccountBalance({ conta: c }: { conta: Conta }) {
  const status = c.conciliacao?.status || "sem_extrato"
  const hasStatement = c.data_saldo_informado && c.saldo_informado != null
  return <div className="ff-account-balance">
    <div className="ff-label">{status === "conflito" ? "Saldo a conferir" : hasStatement ? "Último saldo do extrato" : "Saldo calculado"}</div>
    <div className="ff-card-saldo">{c.saldo_atual === null ? "—" : fmtBRL(c.saldo_atual)}</div>
    <p className="ff-import-help"><FileText className="size-3.5 inline" /> {status === "conflito" ? `Há posições diferentes em ${day(c.data_saldo_informado)}. Confira as fontes antes de usar esse saldo.` : hasStatement ? `Informado em ${day(c.data_saldo_informado)}. Não é uma consulta ao banco em tempo real.` : "Sem posição bancária documentada; valor calculado pelos lançamentos."}</p>
    <p className={`ff-balance-status ${status === "conferido" ? "is-ok" : "is-warning"}`}>
      {status === "conferido" ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}{labels[status]}
    </p>
    {(c.movimentos_posteriores || 0) > 0 && c.saldo_estimado != null && <p className="ff-import-help">Estimativa com movimentos posteriores: <strong>{fmtBRL(c.saldo_estimado)}</strong>. Aguarda novo extrato.</p>}
    {!!c.movimentos_futuros && <p className="ff-import-help">Lançamentos futuros não compõem o saldo de hoje.</p>}
    {c.base_calculo && <details className="ff-balance-details">
      <summary>Como o saldo foi conferido</summary>
      <dl>
        <dt>{c.base_calculo.origem === "abertura_extrato" ? `Abertura do extrato · ${day(c.base_calculo.data)}` : "Saldo inicial do cadastro"}</dt><dd>{fmtBRL(c.base_calculo.valor)}</dd>
        <dt>Entradas registradas até hoje</dt><dd>{fmtBRL(c.base_calculo.entradas)}</dd>
        <dt>Saídas registradas até hoje</dt><dd>{fmtBRL(c.base_calculo.saidas)}</dd>
        <dt>Saldo calculado até hoje</dt><dd>{fmtBRL(c.saldo_calculado ?? c.saldo_atual ?? 0)}</dd>
        {hasStatement && <><dt>Calculado na data do extrato</dt><dd>{fmtBRL(c.saldo_calculado_na_data ?? 0)}</dd><dt>Diferença para o saldo informado</dt><dd>{fmtBRL(c.conciliacao?.diferenca ?? 0)}</dd></>}
      </dl>
      <p className="ff-import-help">O saldo do extrato permanece separado dessa soma. Estimativas incluem somente datas posteriores ao extrato; lançamentos do mesmo dia podem já estar incluídos nele.</p>
      <ul>{c.conciliacao?.avisos.map((issue, i) => <li key={`${issue.codigo}-${i}`}>{issue.texto}{issue.desde && issue.ate ? ` Período: ${day(issue.desde)} a ${day(issue.ate)}.` : ""}</li>)}</ul>
    </details>}
  </div>
}
