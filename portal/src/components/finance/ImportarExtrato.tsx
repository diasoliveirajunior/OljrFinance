import { useRef, useState, useCallback } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Loader2, Upload, FileText, CheckCircle2, AlertCircle, X, HelpCircle, Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { importarOfx, fmtBRL, fmtData } from "@/lib/finance-api"
import type { ResultadoImportOfx } from "@/lib/finance-api"

const BANCOS = [
  "Banco do Brasil", "Nubank", "Itaú", "Bradesco", "Santander",
  "Inter", "Caixa Econômica", "C6 Bank", "Sicoob", "Sicredi",
  "BTG Pactual", "PicPay", "Outro",
]

// Instruções rápidas de onde exportar OFX em cada banco (mensagem curta).
const COMO_EXPORTAR: Record<string, string> = {
  "Banco do Brasil": "App BB → Extrato → Compartilhar → Formato OFX",
  "Nubank": "App Nubank → Perfil → Configurações → Exportar histórico → OFX",
  "Itaú": "App Itaú → Investimentos e Extratos → Extrato → Exportar → OFX",
  "Bradesco": "Internet Banking → Extrato → Salvar → OFX",
  "Santander": "App Santander → Extrato → Compartilhar → OFX",
  "Inter": "App Inter → Extrato → Baixar → OFX",
  "Caixa Econômica": "App Caixa → Extrato → Exportar → OFX",
  "C6 Bank": "App C6 → Extrato → Exportar → OFX",
  "Sicoob": "App Sicoob → Extrato → Compartilhar → OFX",
  "Sicredi": "App Sicredi → Extrato → Compartilhar → OFX",
  "BTG Pactual": "App BTG → Extrato → Exportar → OFX",
  "PicPay": "App PicPay → Carteira → Extrato → Exportar → OFX",
  "Outro": "Procure por 'Exportar OFX' ou 'Extrato OFX' no app/internet banking do seu banco.",
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function ImportarExtrato() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [banco, setBanco] = useState<string>("Banco do Brasil")
  const [dragOver, setDragOver] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportOfx | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: async (): Promise<ResultadoImportOfx> => {
      if (!arquivo) throw new Error("Selecione um arquivo primeiro.")
      const conteudo = await arquivo.text()
      return await importarOfx(conteudo, banco)
    },
    onSuccess: (r) => {
      setResultado(r)
      setShowResult(true)
      setErro(null)
      setArquivo(null)
      if (inputRef.current) inputRef.current.value = ""
      qc.invalidateQueries({ queryKey: ["finance"] })
    },
    onError: (e) => setErro((e as Error).message),
  })

  const escolherArquivo = useCallback((f: File | null) => {
    setErro(null)
    if (!f) { setArquivo(null); return }
    const nome = f.name.toLowerCase()
    if (!nome.endsWith(".ofx") && !nome.endsWith(".xml")) {
      setErro("Só aceito arquivos .ofx (extrato bancário padrão).")
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setErro(`Arquivo muito grande (${fmtSize(f.size)}). Limite: 5 MB.`)
      return
    }
    setArquivo(f)
  }, [])

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Upload className="size-4" /> Importar extrato bancário
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
            <div className="grid gap-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Banco</label>
              <Select value={banco} onValueChange={setBanco}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BANCOS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground flex items-start gap-1 leading-snug">
                <HelpCircle className="size-3 shrink-0 mt-0.5" />
                <span>{COMO_EXPORTAR[banco]}</span>
              </p>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files?.[0] || null
                escolherArquivo(f)
              }}
              onClick={() => inputRef.current?.click()}
              className={`
                cursor-pointer border-2 border-dashed rounded-md p-6 text-center
                transition-colors flex flex-col items-center justify-center gap-1.5
                ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"}
              `}
            >
              {arquivo ? (
                <>
                  <FileText className="size-6 text-primary" />
                  <div className="text-sm font-medium">{arquivo.name}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtSize(arquivo.size)}</div>
                  <Button
                    size="sm" variant="ghost"
                    onClick={(e) => { e.stopPropagation(); escolherArquivo(null) }}
                    className="mt-1 h-7"
                  >
                    <X className="size-3" /> Remover
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="size-6 text-muted-foreground" />
                  <div className="text-sm font-medium">Arraste o arquivo OFX aqui</div>
                  <div className="text-[11px] text-muted-foreground">ou clique pra selecionar</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Máx 5 MB · Formato .ofx</div>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".ofx,.xml"
                className="hidden"
                onChange={(e) => escolherArquivo(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          {erro && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Info className="size-3" />
              Transações duplicadas são detectadas e ignoradas automaticamente.
            </div>
            <Button
              onClick={() => mut.mutate()}
              disabled={!arquivo || mut.isPending}
              size="sm"
            >
              {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Importar transações
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" />
              Importação concluída
            </DialogTitle>
            <DialogDescription>
              Arquivo processado com sucesso.
            </DialogDescription>
          </DialogHeader>
          {resultado && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                    {resultado.importadas}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Importadas
                  </div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                    {resultado.duplicadas}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Duplicadas
                  </div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold">
                    {resultado.totalNoArquivo}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Total no arquivo
                  </div>
                </div>
              </div>

              {resultado.preview.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">
                    Preview das primeiras {resultado.preview.length} transações
                  </div>
                  <div className="rounded-md border divide-y">
                    {resultado.preview.map((t, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 p-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{t.descricao}</div>
                          <div className="text-[10px] text-muted-foreground flex gap-2">
                            <span>{fmtData(t.data)}</span>
                            <Badge variant="outline" className="text-[9px] h-4">{t.categoria}</Badge>
                          </div>
                        </div>
                        <div className={`font-semibold shrink-0 ${
                          t.tipo === "receita" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                        }`}>
                          {t.tipo === "receita" ? "+" : "−"}{fmtBRL(t.valor)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowResult(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
