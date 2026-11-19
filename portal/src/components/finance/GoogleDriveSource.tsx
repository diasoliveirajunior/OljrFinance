import { useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Cloud, FileText, Loader2, RefreshCw } from "lucide-react"
import { driveConnect, driveDisconnect, driveFiles, driveFolder, driveStatus, type DriveFile } from "@/lib/finance-drive-api"

export function GoogleDriveSource({ destino, ocupado, escolher, limpar }: {
  destino: string; ocupado: boolean; escolher: (file: DriveFile) => void; limpar: () => void
}) {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ["finance-drive", "status"], queryFn: driveStatus, retry: false })
  const [folder, setFolder] = useState<string | null>(null)
  const [error, setError] = useState("")
  const files = useInfiniteQuery({ queryKey: ["finance-drive", "files", status.data?.pasta_url, destino],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => driveFiles(destino, pageParam),
    getNextPageParam: last => last.proxima_pagina || undefined,
    enabled: Boolean(status.data?.conectado && status.data.pasta_url && destino),
    refetchInterval: 30000, retry: false,
  })
  const connect = useMutation({ mutationFn: driveConnect, onSuccess: result => {
    const url = new URL(result.url)
    if (url.origin !== "https://accounts.google.com") { setError("Não foi possível iniciar a conexão Google."); return }
    window.location.assign(url.href)
  }, onError: e => setError(e.message) })
  const folderMutation = useMutation({ mutationFn: () => driveFolder(folder ?? status.data?.pasta_url ?? ""),
    onSuccess: async () => { limpar(); setFolder(null); setError(""); await qc.invalidateQueries({ queryKey: ["finance-drive"] }) },
    onError: e => setError(e.message) })
  const disconnect = useMutation({ mutationFn: driveDisconnect, onSuccess: async () => {
    limpar(); setFolder(null); setError(""); await qc.invalidateQueries({ queryKey: ["finance-drive"] })
  }, onError: e => setError(e.message) })
  const busy = ocupado || connect.isPending || folderMutation.isPending || disconnect.isPending
  const listed = files.data?.pages.flatMap(page => page.arquivos) || []
  const ignored = files.data?.pages.reduce((sum, page) => sum + page.ignorados, 0) || 0
  return <section className="ff-drive-source" aria-label="Leitura do Google Drive">
    <h3><Cloud className="size-5" /> Google Drive</h3>
    {status.isPending && <p role="status"><Loader2 className="size-4 animate-spin" /> Consultando conexão…</p>}
    {status.isError && <p role="alert" className="ff-alert ff-alert--danger">{status.error.message}</p>}
    {status.data && !status.data.configurado && <p>A conexão com o Google Drive ainda precisa ser habilitada pelo administrador do Finance. A importação de arquivos do computador continua disponível.</p>}
    {status.data?.configurado && !status.data.conectado && <>
      <p>Conecte sua conta Google para ler os extratos sem baixar e reenviar cada arquivo.</p>
      <p className="ff-import-help">O Google solicitará permissão de leitura dos arquivos do Drive. O Finance consultará somente a pasta que você indicar. Nenhum arquivo será alterado ou apagado.</p>
      <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={() => connect.mutate()}>Conectar Google Drive</button>
    </>}
    {status.data?.conectado && <>
      <div className="ff-import-controls">
        <label className="ff-field">Pasta de extratos (link do Google Drive)
          <input type="url" placeholder="https://drive.google.com/drive/folders/…" value={folder ?? status.data.pasta_url ?? ""} disabled={busy} onChange={e => setFolder(e.target.value)} />
        </label>
        <button type="button" className="ff-btn ff-btn--ghost" disabled={busy || !(folder ?? status.data.pasta_url)} onClick={() => folderMutation.mutate()}>Usar esta pasta</button>
      </div>
      <p className="ff-import-help">{status.data.pasta_nome ? `Pasta: ${status.data.pasta_nome}. ` : "Escolha a pasta em que você guarda os extratos. "}A lista procura novos arquivos a cada 30 segundos enquanto esta janela estiver aberta. Selecione um arquivo para carregar a prévia automaticamente. A gravação depende da sua confirmação.</p>
      {status.data.pasta_url && <div className="ff-drive-toolbar">
        <button type="button" className="ff-btn ff-btn--ghost" disabled={busy || files.isFetching} onClick={() => void files.refetch()}><RefreshCw className="size-4" /> Atualizar arquivos</button>
        <a href={status.data.pasta_url} target="_blank" rel="noreferrer" className="ff-link">Abrir pasta no Drive</a>
      </div>}
      {files.isPending && status.data.pasta_url && destino && <p role="status">Procurando arquivos…</p>}
      {files.isError && <p role="alert" className="ff-alert ff-alert--danger">{files.error.message}</p>}
      {status.data.pasta_url && files.isSuccess && !listed.length && <p>Nenhum arquivo compatível encontrado. Use OFX, Excel (.xlsx), CSV ou PDF de até 3 MB, diretamente nesta pasta.</p>}
      {!!ignored && <p className="ff-import-help">{ignored} item(ns) fora dos formatos/limites aceitos foram ignorados. Subpastas não são percorridas.</p>}
      {!!listed.length && <ul className="ff-drive-files">{listed.map(file => <li key={file.id}>
        <button type="button" disabled={busy} onClick={() => escolher(file)}>
          <FileText className="size-4" /><span>{file.nome}<small>{file.alterado ? "Arquivo alterado desde a última confirmação: confira as mudanças" : file.revisado ? "Já houve confirmação neste destino; repetidos serão ignorados" : "Disponível para leitura"}</small></span><span>Ler extrato</span>
        </button>
      </li>)}</ul>}
      {files.hasNextPage && <button type="button" className="ff-btn ff-btn--ghost" disabled={busy || files.isFetchingNextPage} onClick={() => void files.fetchNextPage()}>Carregar mais arquivos</button>}
      <button type="button" className="ff-link" disabled={busy} onClick={() => disconnect.mutate()}>Desconectar Google Drive deste Finance</button>
    </>}
    {error && <p role="alert" className="ff-alert ff-alert--danger">{error}</p>}
  </section>
}
