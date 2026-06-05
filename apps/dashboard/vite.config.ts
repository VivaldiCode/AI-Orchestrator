import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev the dashboard talks to the API through Vite's proxy, so the same
// relative URLs work behind nginx in production.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:11435';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/admin': { target: API_TARGET, changeOrigin: true },
      '/healthz': { target: API_TARGET, changeOrigin: true },
      '/docs': { target: API_TARGET, changeOrigin: true },
      '/openapi.json': { target: API_TARGET, changeOrigin: true },
      '/ws': { target: API_TARGET.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
