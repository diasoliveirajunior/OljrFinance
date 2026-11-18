import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Loader2, X } from "lucide-react"
import {
  adicionarLancamento,
  type Cartao, type Conta, type FormaPagamento, type TipoLancamento,
} from "@/lib/finance-api"

const CATEGORIAS_DESPESA = [
  "Mercado", "Combustível", "Transporte", "Moradia", "Saúde",
  "Educação", "Lazer", "Vestuário", "Assinaturas", "Pets",
]
const CATEGORIAS_RECEITA = [
  "Salário", "Freelance", "Rendimento", "Reembolso", "Presente",
]

const FORMAS: { valor: FormaPagamento; label: string }[] = [
  { valor: "pix", label: "Pix" },
  { valor: "debito", label: "Débito" },
  { valor: "credito", label: "Crédito" },
  { valor: "transferencia", label: "Transferência" },
  { valor: "extrato", label: "Débito em conta" },
  { valor: "dinheiro", label: "Dinheiro" },
]

const OUTRO_CAT = "__outro__"
function CategoriaSelect({ lista, valor, setValor }: { lista: string[]; valor: string; setValor: (v: string) => void }) {
  const naLista = lista.includes(valor)
  const [outroEscolhido, setModoOutro] = useState(false)
  const modoOutro = outroEscolhido || (!naLista && !!valor)
  return (
    <>
      <select
        value={modoOutro ? OUTRO_CAT : valor}
        onChange={(e) => {
          if (e.target.value === OUTRO_CAT) { setModoOutro(true); setValor("") }
          else { setModoOutro(false); setValor(e.target.value) }
        }}
      >
        {lista.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value={OUTRO_CAT}>Outro…</option>
      </select>
      {modoOutro && (
        <input
          autoFocus
          type="text"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Escreva (ex: Presente do João, Dentista parcela 3)"
          style={{ marginTop: 6 }}
        />
      )}
    </>
  )
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function num(v: string): number {
  return Number(v.replace(/\./g, "").replace(",", "."))
}

type ModalProps = { aberto: boolean; fechar: () => void; contas: Conta[]; cartoes: Cartao[] }
export function NovoLancamentoModal(props: ModalProps) {
  return props.aberto ? <NovoLancamentoForm {...props} /> : null
}
function NovoLancamentoForm({
  aberto, fechar, contas, cartoes,
}: {
  aberto: boolean; fechar: () => void; contas: Conta[]; cartoes: Cartao[]
}) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<TipoLancamento>("despesa")
  const [data, setData] = useState(hojeISO())
  const [descricao, setDescricao] = useState("")
  const [valor, setValor] = useState("")
  const [categoria, setCategoria] = useState("Mercado")
  const destinoInicial = contas[0] ? `conta:${contas[0].id}` : cartoes[0] ? `cartao:${cartoes[0].id}` : ""
  const [destino, setDestino] = useState<string>(destinoInicial)
  const [forma, setForma] = useState<FormaPagamento>(destinoInicial.startsWith("cartao:") ? "credito" : "pix")
  const [origemTexto, setOrigemTexto] = useState("")
  const [litros, setLitros] = useState("")
  const [odometro, setOdometro] = useState("")
  const [erro, setErro] = useState<string | null>(null)

  const isCombustivel = tipo === "despesa" && categoria === "Combustível"
  const precoLitro = useMemo(() => {
    const v = num(valor); const l = num(litros)
    if (!v || !l) return 0
    return v / l
  }, [valor, litros])

  const mut = useMutation({
    mutationFn: async () => {
      const [kind, id] = destino ? destino.split(":") : ["", ""]
      return adicionarLancamento({
        data, descricao, categoria,
        valor: num(valor),
        tipo,
        conta_id: kind === "conta" ? id : null,
        cartao_id: kind === "cartao" ? id : null,
        forma_pagamento: forma,
        origem_texto: tipo === "receita" ? (origemTexto || null) : null,
        litros: isCombustivel && litros ? num(litros) : null,
        odometro: isCombustivel && odometro ? Number(odometro) : null,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); fechar() },
    onError: (e) => setErro((e as Error).message),
  })

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!destino) { setErro("Cadastre uma conta ou cartão antes de lançar."); return }
    if (!valor || num(valor) <= 0) { setErro("Informe um valor válido."); return }
    mut.mutate()
  }

  if (!aberto) return null
  const lista = tipo === "despesa" ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA
  const destinoOptions = [
    ...contas.map((c) => ({ value: `conta:${c.id}`, label: `${c.nome} · conta` })),
    ...(tipo === "despesa" ? cartoes.map((c) => ({ value: `cartao:${c.id}`, label: `${c.nome} · cartão` })) : []),
  ]
  const formasDisponiveis = destino.startsWith("cartao:")
    ? FORMAS.filter((f) => f.valor === "credito")
    : FORMAS.filter((f) => f.valor !== "credito")

  return (
    <div className="ff-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
      <div className="ff-modal" role="dialog">
        <div className="ff-modal-head">
          <h2>Novo lançamento</h2>
          <button className="ff-icon-btn" onClick={fechar} aria-label="Fechar"><X className="size-4" /></button>
        </div>
        <div className="ff-tipo-switch">
          <button type="button" className={tipo === "despesa" ? "is-active danger" : ""} onClick={() => { setTipo("despesa"); setCategoria("Mercado") }}>
            <ArrowUp className="size-4" /> Despesa
          </button>
          <button type="button" className={tipo === "receita" ? "is-active success" : ""} onClick={() => { setTipo("receita"); setCategoria("Salário") }}>
            <ArrowDown className="size-4" /> Receita
          </button>
        </div>
        <form onSubmit={submeter} className="ff-modal-form">
          <div className="ff-field ff-field--valor ff-field--full">
            <label>Valor</label>
            <div className="ff-valor-wrap">
              <span>R$</span>
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" required autoFocus />
            </div>
          </div>
          <div className="ff-field">
            <label>Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </div>
          <div className="ff-field">
            <label>Categoria</label>
            <CategoriaSelect key={tipo} lista={lista} valor={categoria} setValor={setCategoria} />
          </div>
          <div className="ff-field ff-field--full">
            <label>{tipo === "despesa" ? "Estabelecimento / descrição" : "Descrição"}</label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder={tipo === "despesa" ? "Posto Shell, Supermercado Dia, Farmácia…" : "Salário, Freelance, Reembolso…"}
              required />
          </div>
          <div className="ff-field">
            <label>{tipo === "despesa" ? "Pagou com" : "Entrou em"}</label>
            <select value={destino} onChange={(e) => { setDestino(e.target.value); setForma(e.target.value.startsWith("cartao:") ? "credito" : "pix") }}>
              {destinoOptions.length === 0 ? (
                <option value="">Cadastre uma conta primeiro</option>
              ) : destinoOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="ff-field">
            <label>Forma</label>
            <select value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}
              disabled={destino.startsWith("cartao:")}>
              {formasDisponiveis.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
            </select>
          </div>

          {isCombustivel && (
            <>
              <div className="ff-field">
                <label>Litros</label>
                <input inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="32,5" />
              </div>
              <div className="ff-field">
                <label>Odômetro (km)</label>
                <input inputMode="numeric" value={odometro} onChange={(e) => setOdometro(e.target.value)} placeholder="52340" />
              </div>
              {precoLitro > 0 && (
                <div className="ff-field ff-field--full">
                  <div className="ff-inline-hint">
                    Preço por litro: <strong>R$ {precoLitro.toFixed(3).replace(".", ",")}</strong>
                  </div>
                </div>
              )}
            </>
          )}

          {tipo === "receita" && (
            <div className="ff-field ff-field--full">
              <label>Origem (opcional)</label>
              <input type="text" value={origemTexto} onChange={(e) => setOrigemTexto(e.target.value)}
                placeholder="Quem pagou — se quiser identificar" />
            </div>
          )}

          {erro && <div className="ff-alert ff-alert--danger">{erro}</div>}

          <div className="ff-modal-actions">
            <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Cancelar</button>
            <button type="submit" className="ff-btn ff-btn--primary" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="size-4 animate-spin" />} Lançar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
