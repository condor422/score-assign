import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Tenants are addressed as <slug>.localhost in development, mirroring the
    // <slug>.scoreassign.com layout used in production.
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false,
        // The API derives the tenant from the Host header, so it must survive
        // the proxy hop untouched.
        preserveHeaderKeyCase: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
