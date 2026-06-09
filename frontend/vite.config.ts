import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split vendor code into its own chunk so the cache stays warm
        // across deploys when only app code changes (which is the common
        // case). React + react-query don't move per-release; learners
        // shouldn't re-download them every time we ship a copy tweak.
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
  },
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
