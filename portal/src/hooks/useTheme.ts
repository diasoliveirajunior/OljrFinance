import { useEffect, useState } from "react"

type Mode = "dark" | "light"

const KEY = "oljr-finance-theme"

function initial(): Mode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === "dark" || v === "light") return v
  } catch {
    // ignora (navegacao privada, storage bloqueado)
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) {
    return "light"
  }
  return "dark"
}

export function useTheme(): [Mode, () => void] {
  const [mode, setMode] = useState<Mode>(initial)

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode)
    try { localStorage.setItem(KEY, mode) } catch { /* ignora */ }
  }, [mode])

  const toggle = () => setMode((m) => (m === "dark" ? "light" : "dark"))
  return [mode, toggle]
}
