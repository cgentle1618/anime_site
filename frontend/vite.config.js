import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Use 127.0.0.1, not localhost: uvicorn binds IPv4 only, but Node
      // resolves localhost to ::1 first on Windows and the proxy fails.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8000' },
    },
  },
  build: {
    outDir: '../frontend_dist',
    emptyOutDir: true,
  },
})
