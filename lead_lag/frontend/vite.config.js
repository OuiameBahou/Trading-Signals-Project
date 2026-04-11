import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // NLP Sentiment API (FastAPI port 8002) — must come before generic /api
      '/api/nlp/': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nlp/, '/api'),
      },
      // FX Backtest API (FastAPI port 8001) — specific paths take priority
      '/api/fx/backtest': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      '/api/fx/upload': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      '/api/fx/data-pairs': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      '/api/fx/indicators': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      // Existing Flask server (port 5000)
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/figures': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      }
    }
  }
})
