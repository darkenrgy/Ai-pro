import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import fs from 'fs'

const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'https://localhost:8443'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    globals: true,
    include: ['tests/**/*.test.ts?(x)'],
    clearMocks: true,
  },
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Core vendor dependencies
          if (id.includes('node_modules')) {
            if (id.includes('@tensorflow')) {
              return 'vendor-ai';
            }
            if (id.includes('react') || id.includes('zustand') || id.includes('axios')) {
              return 'vendor-core';
            }
            if (id.includes('@stomp') || id.includes('sockjs')) {
              return 'vendor-websocket';
            }
            if (id.includes('html5-qrcode') || id.includes('qrcode') || id.includes('jszip')) {
              return 'vendor-ui';
            }
            return 'vendor';
          }
          // Page-specific chunks
          if (id.includes('AdminDashboard')) {
            return 'page-admin';
          }
          if (id.includes('DashboardPage') || id.includes('pages/Dashboard')) {
            return 'page-dashboard';
          }
          if (id.includes('SessionPage') || id.includes('pages/Session')) {
            return 'page-session';
          }
          if (id.includes('JoinSessionPage') || id.includes('pages/Join')) {
            return 'page-join';
          }
          // Shared utilities
          if (id.includes('hooks') || id.includes('utils') || id.includes('services')) {
            return 'shared';
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    https:
      fs.existsSync('./dev-server-key.pem') && fs.existsSync('./dev-server-cert.pem')
        ? {
            key: fs.readFileSync('./dev-server-key.pem'),
            cert: fs.readFileSync('./dev-server-cert.pem'),
          }
        : fs.existsSync('./localhost+1-key.pem') && fs.existsSync('./localhost+1.pem')
          ? {
              key: fs.readFileSync('./localhost+1-key.pem'),
              cert: fs.readFileSync('./localhost+1.pem'),
            }
          : undefined,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
        timeout: 30000,
        proxyTimeout: 30000,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            const socketError = err as NodeJS.ErrnoException
            if (socketError.code === 'ECONNRESET' || socketError.code === 'EPIPE') {
              console.warn(`[vite-proxy] upstream closed socket for ${req.method} ${req.url}`)
            } else {
              console.error(`[vite-proxy] ${req.method} ${req.url}:`, err.message)
            }

            if (!res || !('headersSent' in res) || res.headersSent) {
              return
            }

            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ message: 'Upstream backend is unavailable' }))
          })
        },
      },
      '/ws': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
        timeout: 30000,
        proxyTimeout: 30000,
        configure: (proxy) => {
          proxy.on('error', (err, req) => {
            const socketError = err as NodeJS.ErrnoException
            if (socketError.code === 'ECONNRESET' || socketError.code === 'EPIPE') {
              console.warn(`[vite-proxy-ws] upstream closed socket for ${req.url}`)
              req.socket?.destroy()
              return
            }
            console.error(`[vite-proxy-ws] ${req.url}:`, err.message)
            req.socket?.destroy()
          })
        },
      }
    }
  }
})
