import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/auth'
import './index.css'
import App from './App.tsx'

import { ThemeProvider } from '@/components/theme-provider'

// Dados FIPLAN/CGC/CGA sao batch (importacao em janelas, nao ao vivo).
// - staleTime 5min: dentro da janela nao refaz query desnecessaria
// - refetchOnWindowFocus false: alternar aba do navegador nao dispara refetch
// - retry 1: erro nao multiplica espera do usuario em 3x
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
