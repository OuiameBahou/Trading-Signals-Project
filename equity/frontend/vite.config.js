import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Equity Indices Backtest API (FastAPI port 8003)
      '/api/fx/backtest': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
      '/api/fx/upload': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
      '/api/fx/data-pairs': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
      '/api/fx/indicators': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
    }
  }
})
