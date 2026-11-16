import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Em produção o app é servido em /portal/ pelo Express. Em dev fica na raiz.
  base: mode === 'production' ? '/portal/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Evita um único arquivo JS muito grande, que atrasava e em alguns
        // navegadores chegava a bloquear a inicialização do portal.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('echarts') || id.includes('zrender')) return 'graficos'
          if (id.includes('@tanstack')) return 'tanstack'
          if (id.includes('react') || id.includes('scheduler')) return 'react'
          if (id.includes('lucide-react')) return 'icones'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Em dev, encaminha as chamadas de API para o Express (server.js).
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
}))
