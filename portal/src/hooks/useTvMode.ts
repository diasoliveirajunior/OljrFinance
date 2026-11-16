import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"

// Hook que ativa o modo TV/Apresentação quando a URL tem ?tv=1
// (ou ?tv=true, ?tv=on, etc.). Adiciona classe .tv-mode ao <html>,
// que ativa regras CSS globais em index.css:
//   - fonte base 22px (tipografia 1.4x maior)
//   - layout expande pra largura cheia
//   - paddings/margens crescem proporcionalmente (rem-based)
//   - controles/tabs ficam maiores pra visualizacao a distancia
export function useTvMode(): boolean {
  const [params] = useSearchParams()
  const raw = params.get("tv")
  const on = raw === "1" || raw === "true" || raw === "on"

  useEffect(() => {
    const root = document.documentElement
    if (on) root.classList.add("tv-mode")
    else root.classList.remove("tv-mode")
    return () => root.classList.remove("tv-mode")
  }, [on])

  return on
}
