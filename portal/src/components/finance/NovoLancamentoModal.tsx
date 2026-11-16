import { useState, useEffect } from "react"
import type { FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { X, Loader2, ArrowDown, ArrowUp } from "lucide-react"
import {
  adicionarLancamento,
  type Conta,
  type Cartao,
  type TipoLancamento,
} from "@/lib/finance-api"

const CATEGORIAS_DESPESA = [
  "Mercado", "Combustível", "Transporte", "Moradia", "Saúde",
  "Educação", "Lazer", "Vestuário", "Assinaturas", "Pets", "Outros",
]
const CATEGORIAS_RECEITA = [
  "Salário", "Freelance", "Rendimento", "Reembolso", "Presente", "Outros",
]

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function NovoLancamentoModal({
  aberto, fechar, contas, cartoes,
}: {
  aberto: boolean
  fechar: () => void
  contas: Conta[]
  cartoes: Cartao[]
}) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<TipoLancamento>("despesa")
  const [data, setData] = useState(hojeISO())
  const [descricao, setDescricao] = useState("")
  const [valor, setValor] = useState("")
  const [categoria, setCategoria] = useState("Mercado")
  const [destino, setDestino] = useState<string>("")
  const [origemTexto, setOrigemTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setTipo("despesa")
    setData(hojeISO())
    setDescricao("")
    setValor("")
    setCategoria("Mercado")
    setOrigemTexto("")
    setErro(null)
    const primeiro = contas[0]?.id || cartoes[0]?.id || ""
    setDestino(primeiro ? (contas[0] ? `conta:${contas[0].id}` : `cartao:${cartoes[0].id}`) : "")
  }, [aberto, contas, cartoes])

  useEffect(() => {
    const lista = tipo === "despesa" ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA
    if (!lista.includes(categoria)) setCategoria(lista[0])
  }, [tipo, categoria])

  const mut = useMutation({
    mutationFn: async () => {
      const [kind, id] = destino ? destino.split(":") : ["", ""]
      return adicionarLancamento({
        data, descricao, categoria,
        valor: Number(valor.replace(",", ".")),
        tipo,
        conta_id: kind === "conta" ? id : null,
        cartao_id: kind === "cartao" ? id : null,
        origem_texto: tipo === "receita" ? (origemTexto || null) : null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance"] })
      fechar()
    },
    onError: (e) => setErro((e as Error).message),
  })

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!destino && tipo === "despesa") {
      setErro("Cadastre uma conta ou cartão antes de lançar.")
      return
    }
    if (!destino && tipo === "receita") {
      setErro("Cadastre uma conta antes de lançar receitas.")
      return
    }
    mut.mutate()
  }

  if (!aberto) return null

  const lista = tipo === "despesa" ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA
  const destinoOptions = [
    ...contas.map((c) => ({ value: `conta:${c.id}`, label: `${c.nome} · conta`, cor: c.cor })),
    ...(tipo === "despesa" ? cartoes.map((c) => ({ value: `cartao:${c.id}`, label: `${c.nome} · cartão`, cor: c.cor })) : []),
  ]

  return (
    <div className="ff-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
      <div className="ff-modal" role="dialog" aria-labelledby="novo-lancamento-titulo">
        <div className="ff-modal-head">
          <h2 id="novo-lancamento-titulo">Novo lançamento</h2>
          <button className="ff-icon-btn" onClick={fechar} aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <div className="ff-tipo-switch">
          <button
            type="button"
            className={tipo === "despesa" ? "is-active danger" : ""}
            onClick={() => setTipo("despesa")}
          >
            <ArrowUp className="size-4" /> Despesa
          </button>
          <button
            type="button"
            className={tipo === "receita" ? "is-active success" : ""}
            onClick={() => setTipo("receita")}
          >
            <ArrowDown className="size-4" /> Receita
          </button>
        </div>
        <form onSubmit={submeter} className="ff-modal-form">
          <div className="ff-field ff-field--valor">
            <label>Valor</label>
            <div className="ff-valor-wrap">
              <span>R$</span>
              <input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="ff-field">
            <label>Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </div>

          <div className="ff-field ff-field--full">
            <label>{tipo === "despesa" ? "Estabelecimento / descrição" : "Descrição"}</label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={tipo === "despesa" ? "Posto Shell, Supermercado Dia, Farmácia…" : "Salário, Freelance, Reembolso…"}
              required
            />
          </div>

          <div className="ff-field">
            <label>Categoria</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {lista.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="ff-field">
            <label>{tipo === "despesa" ? "Pagou com" : "Entrou em"}</label>
            <select value={destino} onChange={(e) => setDestino(e.target.value)}>
              {destinoOptions.length === 0 ? (
                <option value="">Cadastre uma conta primeiro</option>
              ) : destinoOptions.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {tipo === "receita" && (
            <div className="ff-field ff-field--full">
              <label>Origem (opcional)</label>
              <input
                type="text"
                value={origemTexto}
                onChange={(e) => setOrigemTexto(e.target.value)}
                placeholder="Nome de quem pagou, se quiser identificar"
              />
            </div>
          )}

          {erro && <div className="ff-alert ff-alert--danger">{erro}</div>}

          <div className="ff-modal-actions">
            <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Cancelar</button>
            <button type="submit" className="ff-btn ff-btn--primary" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="size-4 animate-spin" />}
              Lançar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
