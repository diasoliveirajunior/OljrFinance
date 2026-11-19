import { apiFetch } from "./api"
export interface DriveStatus { configurado: boolean; conectado: boolean; pasta_nome?: string | null; pasta_url?: string | null
  automacao?: boolean; conta_id?: string | null; cartao_id?: string | null; ultima_execucao?: number | null
  resultado?: { importadas: number; duplicadas: number; pendentes: number; erro: string | null; arquivos: SyncFile[] } | null
}
export interface SyncFile { file_id: string; nome: string; estado: string; motivo: string; importadas: number; duplicadas: number; pendentes: number }
export interface DriveFile { id: string; nome: string; modificado_em: string; revisado: boolean; alterado: boolean }
export function driveStatus() { return apiFetch<DriveStatus>("/api/finance/google-drive/status") }
export function driveConnect() { return apiFetch<{ url: string }>("/api/finance/storage/connect/google", { method: "POST" }) }
export function driveDisconnect() { return apiFetch("/api/finance/storage/connect/google", { method: "DELETE" }) }
export function driveFolder(pasta: string) { return apiFetch("/api/finance/google-drive/pasta", { method: "PUT", body: JSON.stringify({ pasta }) }) }
export function driveFiles(destino: string, pagina?: string) {
  const [kind, id] = destino.split(":")
  const query = new URLSearchParams({ [kind === "cartao" ? "cartao_id" : "conta_id"]: id || "" })
  if (pagina) query.set("pagina", pagina)
  return apiFetch<{ arquivos: DriveFile[]; ignorados: number; proxima_pagina: string | null }>(`/api/finance/google-drive/arquivos?${query}`)
}

export function driveFolders(pai: string, busca: string, pagina?: string) {
  const q = new URLSearchParams({ pai, busca }); if (pagina) q.set("pagina", pagina)
  return apiFetch<{ pastas: { id: string; nome: string }[]; proxima_pagina: string | null }>(`/api/finance/google-drive/pastas?${q}`)
}
export function driveAutomation(ativo: boolean, destino: string) {
  const [kind, id] = destino.split(":")
  return apiFetch("/api/finance/google-drive/automacao", { method: "PUT", body: JSON.stringify({ ativo, conta_id: kind === "conta" ? id : null, cartao_id: kind === "cartao" ? id : null }) })
}
export function driveSyncNow() { return apiFetch("/api/finance/google-drive/sincronizar", { method: "POST" }) }
export function drivePending() { return apiFetch<{ arquivos: SyncFile[]; mais: boolean }>("/api/finance/google-drive/pendencias") }

export function driveResolve(file_id: string) { return apiFetch("/api/finance/google-drive/pendencias/resolver", { method: "POST", body: JSON.stringify({ file_id }) }) }
