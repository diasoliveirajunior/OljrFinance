import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"
import {
  getPreferenciasPainel, salvarPreferenciasPainel,
  type PreferenciasPainel,
} from "@/lib/finance-api"

const SECOES: { chave: keyof PreferenciasPainel; titulo: string; descricao: string }[] = [
  {
    chave: "mostrar_cartoes",
    titulo: "Cartões de crédito",
    descricao: "Fatura aberta, limite usado e dívida comprometida dos seus cartões.",
  },
  {
    chave: "mostrar_investimentos",
    titulo: "Investimentos",
    descricao: "Valor aplicado, valor atual e rentabilidade dos seus investimentos.",
  },
  {
    chave: "mostrar_veiculo",
    titulo: "Veículo",
    descricao: "Consumo médio km/l, preço do litro e km rodados, baseado nos abastecimentos.",
  },
  {
    chave: "mostrar_grupo_familiar",
    titulo: "Grupo familiar",
    descricao: "Divisão de despesas entre membros da família (quando ativado).",
  },
]

export function PreferenciasPainelModal({
  aberto, fechar,
}: { aberto: boolean; fechar: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["finance", "preferencias"], queryFn: getPreferenciasPainel })
  const [draft, setDraft] = useState<PreferenciasPainel>({
    mostrar_cartoes: true, mostrar_investimentos: true,
    mostrar_veiculo: true, mostrar_grupo_familiar: true,
  })

  useEffect(() => { if (data) setDraft(data) }, [data])
  useEffect(() => { if (!aberto && data) setDraft(data) }, [aberto, data])

  const mut = useMutation({
    mutationFn: () => salvarPreferenciasPainel(draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance", "preferencias"] })
      fechar()
    },
  })

  if (!aberto) return null

  return (
    <div className="ff-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
      <div className="ff-modal" role="dialog">
        <div className="ff-modal-head">
          <h2>Personalizar painel</h2>
          <button className="ff-icon-btn" onClick={fechar} aria-label="Fechar"><X className="size-4" /></button>
        </div>
        <p className="ff-inline-hint" style={{ marginBottom: 12 }}>
          Escolha as seções que você quer ver na visão geral. Contas e movimentações sempre aparecem.
        </p>
        <div className="ff-pref-list">
          {SECOES.map((s) => (
            <label key={s.chave} className="ff-pref-item">
              <div className="ff-pref-info">
                <div className="ff-pref-title">{s.titulo}</div>
                <div className="ff-pref-desc">{s.descricao}</div>
              </div>
              <input
                type="checkbox"
                className="ff-pref-toggle"
                checked={draft[s.chave]}
                onChange={(e) => setDraft({ ...draft, [s.chave]: e.target.checked })}
              />
            </label>
          ))}
        </div>
        <div className="ff-modal-actions">
          <button type="button" className="ff-btn ff-btn--ghost" onClick={fechar}>Cancelar</button>
          <button
            type="button"
            className="ff-btn ff-btn--primary"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
          >
            {mut.isPending && <Loader2 className="size-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
