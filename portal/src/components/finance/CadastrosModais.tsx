import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Trash2, X } from "lucide-react"
import {
  atualizarCartao, atualizarConta, atualizarInvestimento,
  criarCartao, criarConta, criarInvestimento,
  removerCartao, removerConta, removerInvestimento,
  type BandeiraCartao, type Cartao, type Conta, type Investimento,
  type TipoConta, type TipoInvestimento,
} from "@/lib/finance-api"

const CORES_SUGERIDAS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f43f5e", "#f59e0b",
  "#ec4899", "#06b6d4", "#64748b", "#820ad1", "#ff7a00", "#0d47a1", "#a16207",
]

const OUTRO = "__outro__"
function num(v: string): number { return Number(v.replace(/\./g, "").replace(",", ".")) }

function Shell({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  return (
    <div className="ff-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
      <div className="ff-modal" role="dialog">
        <div className="ff-modal-head">
          <h2>{titulo}</h2>
          <button className="ff-icon-btn" onClick={fechar} aria-label="Fechar"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function SeletorCor({ valor, setValor }: { valor: string; setValor: (c: string) => void }) {
  return (
    <div className="ff-field ff-field--full">
      <label>Cor do card</label>
      <div className="ff-cores">
        {CORES_SUGERIDAS.map((c) => (
          <button key={c} type="button" onClick={() => setValor(c)}
            className={valor === c ? "ff-cor is-active" : "ff-cor"}
            style={{ background: c }} aria-label={`Cor ${c}`} title={c} />
        ))}
      </div>
    </div>
  )
}

// Campo Select com opcao "Outro..." — se escolhida, abre input texto livre.
function SelectComOutro({
  label, valor, setValor, opcoes,
}: {
  label: string; valor: string; setValor: (v: string) => void;
  opcoes: { v: string; label: string }[]
}) {
  const valorNaLista = opcoes.some((o) => o.v === valor)
  const [modoOutro, setModoOutro] = useState(!valorNaLista && !!valor)
  useEffect(() => { setModoOutro(!valorNaLista && !!valor) }, [valor, valorNaLista])
  return (
    <div className="ff-field">
      <label>{label}</label>
      <select
        value={modoOutro ? OUTRO : valor}
        onChange={(e) => {
          if (e.target.value === OUTRO) { setModoOutro(true); setValor("") }
          else { setModoOutro(false); setValor(e.target.value) }
        }}
      >
        {opcoes.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        <option value={OUTRO}>Outro…</option>
      </select>
      {modoOutro && (
        <input
          autoFocus type="text" value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Descreva"
          style={{ marginTop: 6 }}
        />
      )}
    </div>
  )
}

// ============================================================================
// NOVA / EDITAR CONTA
// ============================================================================
export function ContaModal({ aberto, fechar, editar }: {
  aberto: boolean; fechar: () => void; editar?: Conta
}) {
  const qc = useQueryClient()
  const [banco, setBanco] = useState("")
  const [tipo, setTipo] = useState<string>("corrente")
  const [cor, setCor] = useState("#10b981")
  const [saldoInicial, setSaldoInicial] = useState("")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    if (editar) {
      setBanco(editar.banco || editar.nome)
      setTipo(editar.tipo)
      setCor(editar.cor)
      setSaldoInicial(editar.saldo_inicial ? editar.saldo_inicial.toString().replace(".", ",") : "")
    } else {
      setBanco(""); setTipo("corrente"); setCor("#10b981"); setSaldoInicial("")
    }
    setErro(null)
  }, [aberto, editar])

  const mut = useMutation({
    mutationFn: () => {
      const body = { banco: banco.trim(), tipo: tipo as TipoConta, cor, saldo_inicial: saldoInicial ? num(saldoInicial) : 0 }
      return editar ? atualizarConta(editar.id, body as unknown as Partial<Conta>) : criarConta(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); fechar() },
    onError: (e) => setErro((e as Error).message),
  })

  const remMut = useMutation({
    mutationFn: () => removerConta(editar!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); fechar() },
    onError: (e) => setErro((e as Error).message),
  })

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!banco.trim()) { setErro("Informe o banco."); return }
    mut.mutate()
  }
  if (!aberto) return null
  return (
    <Shell titulo={editar ? "Editar conta" : "Nova conta"} fechar={fechar}>
      <form onSubmit={submeter} className="ff-modal-form">
        <div className="ff-field ff-field--full">
          <label>Banco / instituição</label>
          <input autoFocus value={banco} onChange={(e) => setBanco(e.target.value)}
            placeholder="Nubank, Itaú, Inter, Carteira…" required />
        </div>
        <SelectComOutro label="Tipo" valor={tipo} setValor={setTipo}
          opcoes={[
            { v: "corrente", label: "Conta corrente" },
            { v: "poupanca", label: "Poupança" },
            { v: "carteira", label: "Carteira (dinheiro)" },
            { v: "outra", label: "Outra" },
          ]} />
        <div className="ff-field">
          <label>Saldo inicial</label>
          <input inputMode="decimal" value={saldoInicial}
            onChange={(e) => setSaldoInicial(e.target.value)} placeholder="0,00" />
        </div>
        <SeletorCor valor={cor} setValor={setCor} />
        {erro && <div className="ff-alert ff-alert--danger">{erro}</div>}
        <div className="ff-modal-actions">
          {editar && (
            <button type="button" className="ff-btn ff-btn--danger-ghost"
              onClick={() => {
                if (confirm(`Apagar a conta "${editar.nome}"? (não dá pra desfazer)`)) remMut.mutate()
              }}
              disabled={remMut.isPending}
              title="Apagar esta conta"
            >
              <Trash2 className="size-4" /> Apagar
            </button>
          )}
          <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Cancelar</button>
          <button type="submit" className="ff-btn ff-btn--primary" disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} {editar ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </form>
    </Shell>
  )
}

// ============================================================================
// NOVO / EDITAR CARTAO
// ============================================================================
export function CartaoModal({ aberto, fechar, editar }: {
  aberto: boolean; fechar: () => void; editar?: Cartao
}) {
  const qc = useQueryClient()
  const [nome, setNome] = useState("")
  const [banco, setBanco] = useState("")
  const [bandeira, setBandeira] = useState<string>("mastercard")
  const [limite, setLimite] = useState("")
  const [dividaInicial, setDividaInicial] = useState("")
  const [diaFech, setDiaFech] = useState("28")
  const [diaVenc, setDiaVenc] = useState("5")
  const [cor, setCor] = useState("#8b5cf6")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    if (editar) {
      setNome(editar.nome); setBanco(editar.banco || ""); setBandeira(editar.bandeira)
      setLimite(editar.limite ? editar.limite.toString().replace(".", ",") : "")
      setDividaInicial(editar.divida_inicial ? editar.divida_inicial.toString().replace(".", ",") : "")
      setDiaFech(String(editar.dia_fechamento)); setDiaVenc(String(editar.dia_vencimento))
      setCor(editar.cor)
    } else {
      setNome(""); setBanco(""); setBandeira("mastercard"); setLimite(""); setDividaInicial("")
      setDiaFech("28"); setDiaVenc("5"); setCor("#8b5cf6")
    }
    setErro(null)
  }, [aberto, editar])

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        nome, banco: banco || undefined, bandeira: bandeira as BandeiraCartao,
        limite: num(limite), divida_inicial: dividaInicial ? num(dividaInicial) : 0,
        dia_fechamento: Number(diaFech), dia_vencimento: Number(diaVenc), cor,
      }
      return editar ? atualizarCartao(editar.id, body as unknown as Partial<Cartao>) : criarCartao(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); fechar() },
    onError: (e) => setErro((e as Error).message),
  })

  const remMut = useMutation({
    mutationFn: () => removerCartao(editar!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); fechar() },
    onError: (e) => setErro((e as Error).message),
  })

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim()) { setErro("Dê um apelido ao cartão."); return }
    if (!limite || num(limite) <= 0) { setErro("Informe o limite."); return }
    mut.mutate()
  }
  if (!aberto) return null
  return (
    <Shell titulo={editar ? "Editar cartão" : "Novo cartão de crédito"} fechar={fechar}>
      <form onSubmit={submeter} className="ff-modal-form">
        <div className="ff-field ff-field--full">
          <label>Apelido</label>
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Cartão combustível, Cartão comida, Nubank principal…" required />
        </div>
        <div className="ff-field">
          <label>Banco (opcional)</label>
          <input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Nubank, Itaú…" />
        </div>
        <SelectComOutro label="Bandeira" valor={bandeira} setValor={setBandeira}
          opcoes={[
            { v: "visa", label: "Visa" },
            { v: "mastercard", label: "Mastercard" },
            { v: "elo", label: "Elo" },
            { v: "amex", label: "American Express" },
            { v: "hipercard", label: "Hipercard" },
            { v: "outra", label: "Outra" },
          ]} />
        <div className="ff-field">
          <label>Limite total</label>
          <input inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="0,00" required />
        </div>
        <div className="ff-field">
          <label>Já comprometido</label>
          <input inputMode="decimal" value={dividaInicial} onChange={(e) => setDividaInicial(e.target.value)} placeholder="0,00" />
        </div>
        <div className="ff-field ff-field--full">
          <p className="ff-inline-hint">
            "Já comprometido" é a parcela do limite consumida por dívidas antigas que <strong>não</strong> aparecem na fatura mensal. Deixa 0 se o cartão está limpo.
          </p>
        </div>
        <div className="ff-field">
          <label>Fecha dia</label>
          <input inputMode="numeric" value={diaFech} onChange={(e) => setDiaFech(e.target.value)} min={1} max={31} type="number" />
        </div>
        <div className="ff-field">
          <label>Vence dia</label>
          <input inputMode="numeric" value={diaVenc} onChange={(e) => setDiaVenc(e.target.value)} min={1} max={31} type="number" />
        </div>
        <SeletorCor valor={cor} setValor={setCor} />
        {erro && <div className="ff-alert ff-alert--danger">{erro}</div>}
        <div className="ff-modal-actions">
          {editar && (
            <button type="button" className="ff-btn ff-btn--danger-ghost"
              onClick={() => { if (confirm(`Apagar o cartão "${editar.nome}"?`)) remMut.mutate() }}
              disabled={remMut.isPending} title="Apagar este cartão"
            >
              <Trash2 className="size-4" /> Apagar
            </button>
          )}
          <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Cancelar</button>
          <button type="submit" className="ff-btn ff-btn--primary" disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} {editar ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </form>
    </Shell>
  )
}

// ============================================================================
// NOVO / EDITAR INVESTIMENTO
// ============================================================================
export function InvestimentoModal({ aberto, fechar, editar }: {
  aberto: boolean; fechar: () => void; editar?: Investimento
}) {
  const qc = useQueryClient()
  const [nome, setNome] = useState("")
  const [tipo, setTipo] = useState<string>("tesouro")
  const [instituicao, setInstituicao] = useState("")
  const [aplicado, setAplicado] = useState("")
  const [atual, setAtual] = useState("")
  const [rend, setRend] = useState("")
  const [dataAplic, setDataAplic] = useState("")
  const [venc, setVenc] = useState("")
  const [cor, setCor] = useState("#3b82f6")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    if (editar) {
      setNome(editar.nome); setTipo(editar.tipo); setInstituicao(editar.instituicao || "")
      setAplicado(editar.valor_aplicado.toString().replace(".", ","))
      setAtual(editar.valor_atual.toString().replace(".", ","))
      setRend(editar.rentabilidade_anual.toString().replace(".", ","))
      setDataAplic(editar.data_aplicacao); setVenc(editar.vencimento || ""); setCor(editar.cor)
    } else {
      setNome(""); setTipo("tesouro"); setInstituicao(""); setAplicado(""); setAtual("")
      setRend(""); setDataAplic(new Date().toISOString().slice(0, 10))
      setVenc(""); setCor("#3b82f6")
    }
    setErro(null)
  }, [aberto, editar])

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        nome, tipo: tipo as TipoInvestimento, instituicao: instituicao || undefined,
        valor_aplicado: num(aplicado),
        valor_atual: atual ? num(atual) : num(aplicado),
        rentabilidade_anual: rend ? num(rend) : 0,
        data_aplicacao: dataAplic,
        vencimento: venc || undefined, cor,
      }
      return editar ? atualizarInvestimento(editar.id, body as unknown as Partial<Investimento>) : criarInvestimento(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); fechar() },
    onError: (e) => setErro((e as Error).message),
  })

  const remMut = useMutation({
    mutationFn: () => removerInvestimento(editar!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); fechar() },
    onError: (e) => setErro((e as Error).message),
  })

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim()) { setErro("Dê um nome ao investimento."); return }
    if (!aplicado || num(aplicado) <= 0) { setErro("Informe o valor aplicado."); return }
    mut.mutate()
  }
  if (!aberto) return null
  return (
    <Shell titulo={editar ? "Editar investimento" : "Novo investimento"} fechar={fechar}>
      <form onSubmit={submeter} className="ff-modal-form">
        <div className="ff-field ff-field--full">
          <label>Nome</label>
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Tesouro Selic 2029, CDB XP…" required />
        </div>
        <SelectComOutro label="Tipo" valor={tipo} setValor={setTipo}
          opcoes={[
            { v: "tesouro", label: "Tesouro Direto" },
            { v: "cdb", label: "CDB" },
            { v: "lci", label: "LCI" },
            { v: "lca", label: "LCA" },
            { v: "fundo", label: "Fundo" },
            { v: "acao", label: "Ação" },
            { v: "fii", label: "FII" },
            { v: "cripto", label: "Cripto" },
            { v: "poupanca", label: "Poupança" },
            { v: "outro", label: "Outro" },
          ]} />
        <div className="ff-field">
          <label>Instituição</label>
          <input value={instituicao} onChange={(e) => setInstituicao(e.target.value)} placeholder="XP, BTG, Itaú…" />
        </div>
        <div className="ff-field">
          <label>Valor aplicado</label>
          <input inputMode="decimal" value={aplicado} onChange={(e) => setAplicado(e.target.value)} placeholder="0,00" required />
        </div>
        <div className="ff-field">
          <label>Valor atual</label>
          <input inputMode="decimal" value={atual} onChange={(e) => setAtual(e.target.value)} placeholder="Vazio = igual ao aplicado" />
        </div>
        <div className="ff-field">
          <label>Rent. anual (%)</label>
          <input inputMode="decimal" value={rend} onChange={(e) => setRend(e.target.value)} placeholder="12" />
        </div>
        <div className="ff-field">
          <label>Data da aplicação</label>
          <input type="date" value={dataAplic} onChange={(e) => setDataAplic(e.target.value)} required />
        </div>
        <div className="ff-field">
          <label>Vencimento</label>
          <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
        </div>
        <SeletorCor valor={cor} setValor={setCor} />
        {erro && <div className="ff-alert ff-alert--danger">{erro}</div>}
        <div className="ff-modal-actions">
          {editar && (
            <button type="button" className="ff-btn ff-btn--danger-ghost"
              onClick={() => { if (confirm(`Apagar "${editar.nome}"?`)) remMut.mutate() }}
              disabled={remMut.isPending} title="Apagar este investimento"
            >
              <Trash2 className="size-4" /> Apagar
            </button>
          )}
          <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Cancelar</button>
          <button type="submit" className="ff-btn ff-btn--primary" disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} {editar ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </form>
    </Shell>
  )
}

// Aliases legados (Nova/Novo*) pra manter compat com imports atuais.
export const NovaContaModal = ContaModal
export const NovoCartaoModal = CartaoModal
export const NovoInvestimentoModal = InvestimentoModal
