import { apiFetch } from "./api"
export interface DriveStatus { configurado: boolean; conectado: boolean; pasta_nome?: string | null; pasta_url?: string | null }
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
