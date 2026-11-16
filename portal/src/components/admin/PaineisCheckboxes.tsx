import { Checkbox } from "@/components/ui/checkbox"
import type { Permissao } from "@/lib/types"

// OljrFinance tem apenas o painel FINANCE — a árvore SEDUC ficou no OljrSite.
// Mantemos o componente pra manter a mesma assinatura dos diálogos de aprovação/edição.
export function PaineisCheckboxes({
  value,
  onChange,
}: {
  value: Permissao[]
  onChange: (v: Permissao[]) => void
}) {
  function toggle(p: Permissao, checked: boolean) {
    onChange(checked ? [...new Set([...value, p])] : value.filter((x) => x !== p))
  }

  return (
    <div className="space-y-3 border rounded-md p-3 bg-muted/5 font-sans">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 select-none">
        Painéis liberados
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none text-foreground">
        <Checkbox
          checked={value.includes("FINANCE")}
          onCheckedChange={(c) => toggle("FINANCE", c === true)}
        />
        <span>Finance — controle financeiro pessoal e familiar</span>
      </label>
      <p className="text-[10px] text-muted-foreground ml-6 leading-snug">
        Cada pessoa vê apenas os próprios lançamentos (isolamento por e-mail).
      </p>
    </div>
  )
}
