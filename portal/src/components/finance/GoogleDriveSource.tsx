import { useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Cloud, Folder, ChevronRight, RefreshCw, Search } from "lucide-react"
import { driveConnect, driveDisconnect, driveFolder, driveStatus, driveFolders, driveAutomation, driveSyncNow, drivePending, driveResolve, type DriveFile } from "@/lib/finance-drive-api"

export function GoogleDriveSource({ destino, destinos, ocupado, escolher, limpar }: {
  destino: string; destinos: { value: string; label: string }[]; ocupado: boolean
  escolher: (file: DriveFile, destino: string) => void; limpar: () => void
}) {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ["finance-drive", "status"], queryFn: driveStatus, retry: false, refetchInterval: 5000 })
  const [browsing, setBrowsing] = useState(false)
  const [path, setPath] = useState([{ id: "root", nome: "Meu Drive" }])
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const current = path[path.length - 1]
  const folders = useInfiniteQuery({ queryKey: ["finance-drive", "folders", current.id, query], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => driveFolders(current.id, query, pageParam), getNextPageParam: page => page.proxima_pagina || undefined,
    enabled: Boolean(status.data?.conectado && browsing), retry: false })
  const pending = useQuery({ queryKey: ["finance-drive", "pending"], queryFn: drivePending,
    enabled: Boolean(status.data?.conectado), refetchInterval: 10000, retry: false })
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["finance-drive"] }); await qc.invalidateQueries({ queryKey: ["finance"] }) }
  const mutationError = (e: Error) => { setError(e.message); setNotice("") }
  const connect = useMutation({ mutationFn: driveConnect, onSuccess: result => {
    const url = new URL(result.url)
    if (url.origin !== "https://accounts.google.com") { setError("Não foi possível iniciar a conexão Google."); return }
    window.location.assign(url.href)
  }, onError: mutationError })
  const selectFolder = useMutation({ mutationFn: (id: string) => driveFolder(id), onSuccess: async () => {
    limpar(); setBrowsing(false); setError(""); setNotice("Pasta escolhida. Confira o destino e ative a sincronização."); await refresh()
  }, onError: mutationError })
  const automation = useMutation({ mutationFn: (active: boolean) => driveAutomation(active, destino), onSuccess: async (_, active) => {
    limpar(); setError(""); setNotice(active ? "Sincronização ativada. A primeira leitura já foi iniciada no servidor." : "Sincronização pausada."); await refresh()
  }, onError: mutationError })
  const sync = useMutation({ mutationFn: driveSyncNow, onSuccess: async () => { setError(""); setNotice("Sincronização solicitada. Acompanhe o resultado abaixo."); await refresh() }, onError: mutationError })
  const resolve = useMutation({ mutationFn: driveResolve, onSuccess: refresh, onError: mutationError })
  const disconnect = useMutation({ mutationFn: driveDisconnect, onSuccess: async () => { limpar(); setError(""); setNotice(""); await refresh() }, onError: mutationError })
  const busy = resolve.isPending || ocupado || connect.isPending || selectFolder.isPending || automation.isPending || disconnect.isPending
  const savedTarget = status.data?.conta_id ? `conta:${status.data.conta_id}` : `cartao:${status.data?.cartao_id}`
  return <section className="ff-drive-source" aria-label="Leitura do Google Drive">
    <h3><Cloud className="size-5" /> Sincronização Google Drive</h3>
    {status.isPending && <p role="status">Consultando conexão…</p>}
    {status.isError && <p role="alert">{status.error.message}</p>}
    {status.data && !status.data.configurado && <p>A conexão Google aguarda configuração pelo administrador do Finance.</p>}
    {status.data?.configurado && !status.data.conectado && <>
      <p>Conecte sua conta, escolha a pasta e associe uma conta ou cartão. O Finance lerá os arquivos e lançará os movimentos reconhecidos automaticamente.</p>
      <p className="ff-import-help">O Google autoriza leitura do Drive. O Finance consulta as pastas para sua escolha e processa somente arquivos diretamente na pasta selecionada. Nenhum arquivo é alterado ou apagado.</p>
      <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={() => connect.mutate()}>Conectar Google Drive</button>
    </>}
    {status.data?.conectado && <>
      <p><strong>Pasta:</strong> {status.data.pasta_nome || "Escolha uma pasta"}</p>
      <button type="button" className="ff-btn ff-btn--ghost" disabled={busy} onClick={() => { setBrowsing(!browsing); setSearch(""); setQuery("") }}><Folder className="size-4" /> {browsing ? "Fechar pastas" : "Escolher pasta"}</button>
      {browsing && <div className="ff-drive-browser">
        <div className="ff-drive-toolbar" aria-label="Caminho da pasta">{path.map((item, i) => <button key={item.id} type="button" className="ff-btn ff-btn--ghost" onClick={() => { setPath(path.slice(0, i + 1)); setQuery(""); setSearch("") }}>{item.nome}<ChevronRight className="size-3" /></button>)}</div>
        <div className="ff-import-controls"><label className="ff-field">Buscar pasta no Drive<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome da pasta, inclusive compartilhadas" /></label><button type="button" className="ff-btn ff-btn--ghost" onClick={() => setQuery(search.trim())}><Search className="size-4" /> Buscar</button></div>
        {folders.isPending && <p role="status">Carregando pastas…</p>}
        {folders.isError && <p role="alert">{folders.error.message}</p>}
        <ul className="ff-drive-files">{folders.data?.pages.flatMap(page => page.pastas).map(folder => <li key={folder.id}><button type="button" disabled={busy} onClick={() => { setPath([...path, folder]); setQuery(""); setSearch("") }}><Folder className="size-4" /> {folder.nome}<ChevronRight className="size-4" /></button></li>)}</ul>
        {folders.isSuccess && !folders.data.pages.some(page => page.pastas.length) && <p>Nenhuma subpasta encontrada. Use a pasta atual ou busque pelo nome.</p>}
        {folders.hasNextPage && <button type="button" className="ff-btn ff-btn--ghost" disabled={folders.isFetchingNextPage} onClick={() => void folders.fetchNextPage()}>Mais pastas</button>}
        {current.id !== "root" && !query && <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={() => selectFolder.mutate(current.id)}>Usar pasta {current.nome}</button>}
      </div>}
      {status.data.pasta_url && <>
        <p className="ff-import-help">Os movimentos reconhecidos serão lançados em lote; dúvidas aparecerão nas pendências. A verificação acontece aproximadamente a cada 5 minutos com o servidor ativo, mesmo com esta tela fechada.</p>
        {status.data.automacao && <p><strong>Ativa para:</strong> {destinos.find(d => d.value === savedTarget)?.label || "Destino não disponível"}. {savedTarget !== destino && "A conta escolhida acima é diferente do destino salvo."}</p>}
        <div className="ff-drive-toolbar">
          {(!status.data.automacao || savedTarget !== destino) && <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !destino} onClick={() => automation.mutate(true)}>{status.data.automacao ? "Usar destino escolhido acima" : "Ativar sincronização automática"}</button>}
          {status.data.automacao && <><button type="button" className="ff-btn ff-btn--ghost" disabled={busy || sync.isPending} onClick={() => sync.mutate()}><RefreshCw className="size-4" /> Sincronizar agora</button><button type="button" className="ff-btn ff-btn--ghost" disabled={busy} onClick={() => automation.mutate(false)}>Pausar</button></>}
        </div>
        {status.data.ultima_execucao && <p>Última verificação: {new Date(status.data.ultima_execucao).toLocaleString("pt-BR")}</p>}
        {status.data.resultado && <p role="status">Último lote: {status.data.resultado.importadas} lançamento(s), {status.data.resultado.duplicadas} repetido(s), {status.data.resultado.pendentes} movimento(s) pendente(s).</p>}
        {status.data.resultado?.erro && <p role="alert">{status.data.resultado.erro}</p>}
      </>}
      <h4>Pendências de leitura</h4>
      <p className="ff-import-help">Resolva a leitura ou encerre a pendência para ignorar esta versão do arquivo. Encerrar não grava nem apaga lançamentos.</p>
      {pending.data?.mais && <p>Mostrando até 100 arquivos por situação. Ao encerrar pendências, os próximos aparecerão.</p>}
      {pending.isError && <p role="alert">{pending.error.message}</p>}
      {pending.data && !pending.data.arquivos.length && <p>Nenhuma pendência registrada nesta configuração.</p>}
      <ul className="ff-drive-files">{pending.data?.arquivos.map(file => <li key={file.file_id}><span>{file.nome}<small>{file.motivo}</small></span>{file.estado === "pendente" && <button type="button" className="ff-btn ff-btn--ghost" disabled={busy} onClick={() => escolher({ id: file.file_id, nome: file.nome, modificado_em: "", revisado: false, alterado: false }, savedTarget)}>Resolver pendência</button>}<button type="button" className="ff-btn ff-btn--ghost" disabled={busy} onClick={() => resolve.mutate(file.file_id)}>Encerrar pendência</button></li>)}</ul>
      <button type="button" className="ff-link" disabled={busy} onClick={() => disconnect.mutate()}>Desconectar Google Drive</button>
    </>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="ff-alert ff-alert--danger">{error}</p>}
  </section>
}
