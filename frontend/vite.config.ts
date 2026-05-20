import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow Cloudflare quick-tunnel URLs (each has a different random
    // subdomain under trycloudflare.com). The leading dot makes Vite
    // treat the entry as a wildcard for any subdomain. Without this,
    // Vite blocks the request with "host not allowed" to prevent
    // DNS-rebinding attacks during development.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})
