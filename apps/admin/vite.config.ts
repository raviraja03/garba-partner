import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/** Env files live at the repository root; only `VITE_*` variables reach the browser bundle. */
const envDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Load only API_* (dev proxy target) and ADMIN_ORIGIN (dev port); secrets are never read here.
  const env = loadEnv(mode, envDir, ['API_', 'ADMIN_ORIGIN']);
  const apiTarget = `http://${env.API_HOST ?? '127.0.0.1'}:${env.API_PORT ?? '4000'}`;
  // The dev server must run on the origin the API trusts (CORS, CSRF), so take the port from it.
  const port = Number(new URL(env.ADMIN_ORIGIN ?? 'http://localhost:5174').port) || 5174;
  const proxy = { '/api': { target: apiTarget } };

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: { host: 'localhost', port, strictPort: true, proxy },
    preview: { host: 'localhost', port: 4174, strictPort: true, proxy },
  };
});
