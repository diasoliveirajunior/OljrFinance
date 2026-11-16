import { auth } from "./firebase"

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

// Faz fetch anexando o ID token do Firebase como Bearer (contrato do porteiro).
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)

  const user = auth.currentUser
  if (user) {
    const token = await user.getIdToken()
    headers.set("Authorization", `Bearer ${token}`)
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(path, { ...init, headers })
  const text = await res.text()
  
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch (e) {
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        throw new ApiError("Erro interno do servidor (resposta HTML inesperada). O sistema pode estar sendo atualizado.", res.status)
      }
      throw new ApiError(`Resposta inválida do servidor: ${text.slice(0, 100)}`, res.status)
    }
  }

  if (!res.ok) {
    const msg = (data && data.error) || `Erro ${res.status}`
    throw new ApiError(msg, res.status, data && data.code)
  }
  return data as T
}
