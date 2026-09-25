import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/** Env files live at the repository root; only `VITE_*` variables reach the browser bundle. */
const envDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Load only API_* for the dev proxy target; secrets are never read here.
  const env = loadEnv(mode, envDir, 'API_');
  const apiTarget = `http://${env.API_HOST ?? '127.0.0.1'}:${env.API_PORT ?? '4000'}`;
  const proxy = { '/api': { target: apiTarget } };

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: { host: 'localhost', port: 5174, strictPort: true, proxy },
    preview: { host: 'localhost', port: 4174, strictPort: true, proxy },
  };
});
