import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // GitHub Pages needs /GermlineRx/ base; Vercel uses /
  base: process.env.VERCEL ? '/' : (mode === 'production' ? '/GermlineRx/' : '/'),
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
}))
