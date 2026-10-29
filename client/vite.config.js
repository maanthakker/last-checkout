import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Express server runs on :3000; Vite proxies the API and the
// Socket.IO connection to it so both online modes work locally.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
