import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Save, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { salvarFinancePreferencias, type FinanceMascote, type FinancePreferencias, type ResumoFinance } from "@/lib/finance-api"

const MASCOTES: Record<FinanceMascote, { emoji: string; nome: string }> = {
  gato: { emoji: "🐱", nome: "Gatinho" }, cachorro: { emoji: "🐶", nome: "Cachorrinho" },
  urso: { emoji: "🐻", nome: "Ursinho" }, macaco: { emoji: "🐵", nome: "Macaquinho" },
  nenhum: { emoji: "—", nome: "Sem mascote" },
}

function reacao(resumo?: ResumoFinance) {
  if (!resumo) return { humor: "neutro", mensagem: "Vamos organizar o seu mês!" }
  if (resumo.despesa_mes > resumo.receita_mes && resumo.despesa_mes > 0) return { humor: "alerta", mensagem: "Atenção: seus gastos passaram das receitas." }
  if (resumo.taxa_poupanca >= 30) return { humor: "feliz", mensagem: "Mandou bem! Sua economia está acima da meta." }
  if (resumo.despesa_mes > 0) return { humor: "neutro", mensagem: "Está indo bem. Vamos cuidar dos próximos gastos." }
  return { humor: "feliz", mensagem: "Tudo pronto para acompanhar suas finanças!" }
}

export function MascoteFinance({ preferencias, resumo }: { preferencias: FinancePreferencias; resumo?: ResumoFinance }) {
  if (preferencias.mascote === "nenhum") return null
  const animal = MASCOTES[preferencias.mascote]; const estado = reacao(resumo)
  return <div className={`finance-mascot finance-mascot--${estado.humor} ${preferencias.animacoes ? "is-animated" : ""}`} aria-live="polite"><span className="finance-mascot__animal" aria-hidden="true">{animal.emoji}</span><div><p className="text-xs font-semibold">{animal.nome} financeiro</p><p className="text-xs text-muted-foreground">{estado.mensagem}</p></div></div>
}

export function PersonalizacaoFinance({ preferencias }: { preferencias: FinancePreferencias }) {
  const qc = useQueryClient(); const [draft, setDraft] = useState(preferencias)
  useEffect(() => setDraft(preferencias), [preferencias])
  const mut = useMutation({ mutationFn: salvarFinancePreferencias, onSuccess: (data) => qc.setQueryData(["finance", "preferencias"], data) })
  return <section className="finance-preferences-menu"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-semibold">Escolha seu companheiro</p><p className="mt-1 text-xs text-muted-foreground">O painel mantém um único layout profissional. Escolha apenas o animal e as animações.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:min-w-[480px]"><div className="grid gap-1.5"><Label className="text-[10px] uppercase tracking-wide">Companheiro</Label><Select value={draft.mascote} onValueChange={(mascote) => setDraft({ ...draft, mascote: mascote as FinanceMascote })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(MASCOTES) as FinanceMascote[]).map((key) => <SelectItem key={key} value={key}>{MASCOTES[key].emoji} {MASCOTES[key].nome}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end gap-2"><Button type="button" variant={draft.animacoes ? "default" : "outline"} onClick={() => setDraft({ ...draft, animacoes: !draft.animacoes })}><Sparkles className="size-4" />{draft.animacoes ? "Animado" : "Sem animação"}</Button><Button type="button" size="icon" title="Salvar preferências" disabled={mut.isPending} onClick={() => mut.mutate({ ...draft, layout: "confortavel" })}><Save className="size-4" /></Button></div></div></div></section>
}
