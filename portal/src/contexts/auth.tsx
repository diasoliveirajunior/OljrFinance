import { createContext, useContext, useEffect, useState, useCallback } from "react"
import type { ReactNode } from "react"
import { onAuthStateChanged, signOut } from "firebase/auth"
import type { User } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { apiFetch } from "@/lib/api"
import type { MeResponse } from "@/lib/types"

interface AuthContextValue {
  firebaseUser: User | null
  me: MeResponse | null
  loading: boolean
  isAdmin: boolean
  refreshMe: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const data = await apiFetch<MeResponse>("/api/access/me")
      setMe(data)
    } catch {
      setMe(null)
    }
  }, [])

  const refreshMe = useCallback(async () => {
    if (auth.currentUser) await fetchMe()
  }, [fetchMe])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        await fetchMe()
      } else {
        setMe(null)
      }
      setLoading(false)
    })
    return unsub
  }, [fetchMe])

  const logout = useCallback(async () => {
    await signOut(auth)
    setMe(null)
  }, [])

  const isAdmin = me?.usuario?.papel === "admin"

  return (
    <AuthContext.Provider
      value={{ firebaseUser, me, loading, isAdmin, refreshMe, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>")
  return ctx
}
