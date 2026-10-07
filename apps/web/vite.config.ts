import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/** Env files live at the repository root; only `VITE_*` variables reach the browser bundle. */
const envDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Load only API_* (dev proxy target) and WEB_ORIGIN (dev port); secrets are never read here.
  const env = loadEnv(mode, envDir, ['API_', 'WEB_ORIGIN']);
  const apiTarget = `http://${env.API_HOST ?? '127.0.0.1'}:${env.API_PORT ?? '4000'}`;
  // The dev server must run on the origin the API trusts (CORS, CSRF), so take the port from it.
  const port = Number(new URL(env.WEB_ORIGIN ?? 'http://localhost:5173').port) || 5173;
  // Socket.IO (chat) shares the API server; `ws` forwards the WebSocket upgrade.
  const proxy = {
    '/api': { target: apiTarget },
    '/socket.io': { target: apiTarget, ws: true },
  };

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: { host: 'localhost', port, strictPort: true, proxy },
    preview: { host: 'localhost', port: 4173, strictPort: true, proxy },
  };
});
