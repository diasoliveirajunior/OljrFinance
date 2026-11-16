import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Cloud, ExternalLink, HardDrive, Loader2, RefreshCw, Unplug } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  conectarStorage, desconectarStorage, getDriveStatus, getStorageStatus, sincronizarDrive,
  type StorageProvider,
} from "@/lib/finance-api"

const providerLabel: Record<StorageProvider, string> = {
  google: "Google Drive",
  microsoft: "Microsoft OneDrive",
}

function formatSyncDate(value: { _seconds?: number } | string | null | undefined) {
  if (!value) return "Ainda não sincronizado"
  if (typeof value === "string") return new Date(value).toLocaleString("pt-BR")
  if (value._seconds) return new Date(value._seconds * 1000).toLocaleString("pt-BR")
  return "Sincronização registrada"
}

export function SincronizarDrive() {
  const qc = useQueryClient()
  const legacyQ = useQuery({
    queryKey: ["finance", "drive", "status"], queryFn: getDriveStatus, retry: false,
  })
  const storageQ = useQuery({
    queryKey: ["finance", "storage", "status"], queryFn: getStorageStatus, retry: false,
  })
  const syncMut = useMutation({
    mutationFn: sincronizarDrive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  })
  const connectMut = useMutation({
    mutationFn: conectarStorage,
    onSuccess: ({ url }) => window.location.assign(url),
  })
  const disconnectMut = useMutation({
    mutationFn: desconectarStorage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "storage"] }),
  })

  const connectedLegacy = Boolean(legacyQ.data?.conectado)
  const result = syncMut.data || legacyQ.data?.ultimo_resultado
  const anyPersonalConnection = Object.values(storageQ.data?.providers || {}).some((p) => p.conectado)
  const error = (connectMut.error || disconnectMut.error || syncMut.error) as Error | null

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Cloud className="size-4" /> Extratos na nuvem
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Conecte somente a pasta “Extratos OLJR”. O portal não recebe sua senha nem acesso bancário.
            </p>
          </div>
          <Badge variant={connectedLegacy || anyPersonalConnection ? "default" : "secondary"}>
            {storageQ.isLoading ? "Verificando..." : connectedLegacy || anyPersonalConnection ? "Conectado" : "Não conectado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-3 md:grid-cols-2">
          {(["google", "microsoft"] as StorageProvider[]).map((provider) => {
            const item = storageQ.data?.providers?.[provider]
            const busy = connectMut.isPending || disconnectMut.isPending
            return (
              <div key={provider} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <HardDrive className="size-4" /> {providerLabel[provider]}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item?.conectado ? "Pasta exclusiva conectada com acesso restrito." : "Cria e conecta uma pasta exclusiva para seus extratos."}
                    </p>
                  </div>
                  {item?.conectado && <CheckCircle2 className="size-5 text-emerald-600" />}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item?.conectado ? (
                    <>
                      {item.pasta_url && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={item.pasta_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-3.5" /> Abrir pasta
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => disconnectMut.mutate(provider)}>
                        <Unplug className="size-3.5" /> Desconectar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => connectMut.mutate(provider)}>
                      {connectMut.isPending && connectMut.variables === provider
                        ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
                      Conectar {provider === "google" ? "Google" : "Microsoft"}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}

        {connectedLegacy && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Banco do Brasil · conexão atual do CEO</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {legacyQ.data?.arquivos_encontrados ?? 0} arquivos · última leitura {formatSyncDate(legacyQ.data?.ultima_sincronizacao)}
                </p>
              </div>
              <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
                {syncMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {syncMut.isPending ? "Lendo extratos..." : "Sincronizar agora"}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <p className="text-xs text-muted-foreground">
            Última leitura: {result.importadas} novos lançamentos; {result.duplicadas} duplicados ignorados.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
