import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"
import {
  criarCartao, criarConta, criarInvestimento,
  type BandeiraCartao, type TipoConta, type TipoInvestimento,
} from "@/lib/finance-api"

const CORES_SUGERIDAS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f43f5e", "#f59e0b",
  "#ec4899", "#06b6d4", "#64748b", "#820ad1", "#ff7a00", "#0d47a1", "#a16207",
]

function num(v: string): number {
  return Number(v.replace(/\./g, "").replace(",", "."))
}

function Shell({
  titulo, fechar, children,
}: { titulo: string; fechar: () => void; children: React.ReactNode }) {
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
          <button
            key={c}
            type="button"
            onClick={() => setValor(c)}
            className={valor === c ? "ff-cor is-active" : "ff-cor"}
            style={{ background: c }}
            aria-label={`Cor ${c}`}
            title={c}
          />
        ))}
      </div>
    </div>
  )
}

export function NovaContaModal({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  const qc = useQueryClient()
  const [banco, setBanco] = useState("")
  const [tipo, setTipo] = useState<TipoConta>("corrente")
  const [cor, setCor] = useState("#10b981")
  const [saldoInicial, setSaldoInicial] = useState("")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setBanco(""); setTipo("corrente"); setCor("#10b981"); setSaldoInicial(""); setErro(null)
  }, [aberto])

  const mut = useMutation({
    mutationFn: () => criarConta({
      banco: banco.trim(), tipo, cor,
      saldo_inicial: saldoInicial ? num(saldoInicial) : 0,
    }),
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
    <Shell titulo="Nova conta" fechar={fechar}>
      <form onSubmit={submeter} className="ff-modal-form">
        <div className="ff-field ff-field--full">
          <label>Banco / instituição</label>
          <input autoFocus value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Nubank, Itaú, Inter, Carteira…" required />
        </div>
        <div className="ff-field">
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoConta)}>
            <option value="corrente">Conta corrente</option>
            <option value="poupanca">Poupança</option>
            <option value="carteira">Carteira (dinheiro)</option>
            <option value="outra">Outra</option>
          </select>
        </div>
        <div className="ff-field">
          <label>Saldo inicial</label>
          <input inputMode="decimal" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} placeholder="0,00" />
        </div>
        <SeletorCor valor={cor} setValor={setCor} />
        {erro && <div className="ff-alert ff-alert--danger">{erro}</div>}
        <div className="ff-modal-actions">
          <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Cancelar</button>
          <button type="submit" className="ff-btn ff-btn--primary" disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} Cadastrar
          </button>
        </div>
      </form>
    </Shell>
  )
}

export function NovoCartaoModal({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  const qc = useQueryClient()
  const [nome, setNome] = useState("")
  const [banco, setBanco] = useState("")
  const [bandeira, setBandeira] = useState<BandeiraCartao>("mastercard")
  const [limite, setLimite] = useState("")
  const [dividaInicial, setDividaInicial] = useState("")
  const [diaFech, setDiaFech] = useState("28")
  const [diaVenc, setDiaVenc] = useState("5")
  const [cor, setCor] = useState("#8b5cf6")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setNome(""); setBanco(""); setBandeira("mastercard"); setLimite(""); setDividaInicial("")
    setDiaFech("28"); setDiaVenc("5"); setCor("#8b5cf6"); setErro(null)
  }, [aberto])

  const mut = useMutation({
    mutationFn: () => criarCartao({
      nome, banco: banco || undefined, bandeira,
      limite: num(limite),
      divida_inicial: dividaInicial ? num(dividaInicial) : 0,
      dia_fechamento: Number(diaFech),
      dia_vencimento: Number(diaVenc), cor,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); fechar() },
    onError: (e) => setErro((e as Error).message),
  })

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim()) { setErro("Dê um apelido ao cartão (ex: Combustível, Comida)."); return }
    if (!limite || num(limite) <= 0) { setErro("Informe o limite do cartão."); return }
    mut.mutate()
  }
  if (!aberto) return null
  return (
    <Shell titulo="Novo cartão de crédito" fechar={fechar}>
      <form onSubmit={submeter} className="ff-modal-form">
        <div className="ff-field ff-field--full">
          <label>Apelido</label>
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Cartão combustível, Cartão comida, Nubank principal…" required />
        </div>
        <div className="ff-field">
          <label>Banco (opcional)</label>
          <input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Nubank, Itaú…" />
        </div>
        <div className="ff-field">
          <label>Bandeira</label>
          <select value={bandeira} onChange={(e) => setBandeira(e.target.value as BandeiraCartao)}>
            <option value="visa">Visa</option>
            <option value="mastercard">Mastercard</option>
            <option value="elo">Elo</option>
            <option value="amex">American Express</option>
            <option value="hipercard">Hipercard</option>
            <option value="outra">Outra</option>
          </select>
        </div>
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
            "Já comprometido" é a parcela do limite que já está comida por dívidas antigas e <strong>não</strong> aparece na fatura mensal. Deixa 0 se o cartão está limpo.
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
          <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Cancelar</button>
          <button type="submit" className="ff-btn ff-btn--primary" disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} Cadastrar
          </button>
        </div>
      </form>
    </Shell>
  )
}

export function NovoInvestimentoModal({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  const qc = useQueryClient()
  const [nome, setNome] = useState("")
  const [tipo, setTipo] = useState<TipoInvestimento>("tesouro")
  const [instituicao, setInstituicao] = useState("")
  const [aplicado, setAplicado] = useState("")
  const [atual, setAtual] = useState("")
  const [rend, setRend] = useState("")
  const [dataAplic, setDataAplic] = useState(() => new Date().toISOString().slice(0, 10))
  const [venc, setVenc] = useState("")
  const [cor, setCor] = useState("#3b82f6")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setNome(""); setTipo("tesouro"); setInstituicao(""); setAplicado(""); setAtual("")
    setRend(""); setDataAplic(new Date().toISOString().slice(0, 10))
    setVenc(""); setCor("#3b82f6"); setErro(null)
  }, [aberto])

  const mut = useMutation({
    mutationFn: () => criarInvestimento({
      nome, tipo, instituicao: instituicao || undefined,
      valor_aplicado: num(aplicado),
      valor_atual: atual ? num(atual) : num(aplicado),
      rentabilidade_anual: rend ? num(rend) : 0,
      data_aplicacao: dataAplic,
      vencimento: venc || undefined, cor,
    }),
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
    <Shell titulo="Novo investimento" fechar={fechar}>
      <form onSubmit={submeter} className="ff-modal-form">
        <div className="ff-field ff-field--full">
          <label>Nome</label>
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Tesouro Selic 2029, CDB XP…" required />
        </div>
        <div className="ff-field">
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoInvestimento)}>
            <option value="tesouro">Tesouro Direto</option>
            <option value="cdb">CDB</option>
            <option value="lci">LCI</option>
            <option value="lca">LCA</option>
            <option value="fundo">Fundo</option>
            <option value="acao">Ação</option>
            <option value="fii">FII</option>
            <option value="cripto">Cripto</option>
            <option value="poupanca">Poupança</option>
            <option value="outro">Outro</option>
          </select>
        </div>
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
          <input inputMode="decimal" value={atual} onChange={(e) => setAtual(e.target.value)} placeholder="Deixe vazio se igual ao aplicado" />
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
          <label>Vencimento (opcional)</label>
          <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
        </div>
        <SeletorCor valor={cor} setValor={setCor} />
        {erro && <div className="ff-alert ff-alert--danger">{erro}</div>}
        <div className="ff-modal-actions">
          <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Cancelar</button>
          <button type="submit" className="ff-btn ff-btn--primary" disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} Cadastrar
          </button>
        </div>
      </form>
    </Shell>
  )
}
