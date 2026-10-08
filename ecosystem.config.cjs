/**
 * PM2 process file for production (docs/deployment/pm2.md).
 *
 *   pm2 startOrRestart /srv/garba-partner/current/ecosystem.config.cjs --update-env
 *
 * No secrets live here. The API reads them from `<release>/.env`, which the deploy script
 * links to the protected env file outside the repository (default
 * /etc/garba-partner/production.env).
 *
 * Exactly ONE instance, fork mode. Do not switch to cluster mode or raise `instances`:
 * rate limiters are in memory, the background jobs (sanction expiry, notifications, payment
 * reconciliation) run inside this process and would run once per instance, and Socket.IO
 * would need sticky sessions plus a shared adapter.
 */
// PM2 loads this file through the `current` symlink; `__dirname` is the real release
// directory, so every (re)start runs the release it was started from.
const appDir = __dirname;
const logDir = process.env.GP_LOG_DIR || '/var/log/garba-partner';

module.exports = {
  apps: [
    {
      name: 'gp-api',
      cwd: appDir,
      script: `${appDir}/apps/api/dist/server.js`,
      interpreter_args: '--enable-source-maps',
      exec_mode: 'fork',
      instances: 1,

      // NODE_ENV comes from here, never from the env file (Vite reads that file at build time).
      env: { NODE_ENV: 'production' },

      // The API calls process.send('ready') once it is listening.
      wait_ready: true,
      listen_timeout: 15000,
      // Longer than the API's own 10 s graceful shutdown (in-flight requests, sockets, DB pool).
      kill_timeout: 12000,

      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      exp_backoff_restart_delay: 200,
      max_memory_restart: '512M',

      // pino writes JSON lines with its own timestamps; logrotate rotates these files.
      out_file: `${logDir}/api.out.log`,
      error_file: `${logDir}/api.err.log`,
      merge_logs: true,
      time: false,
    },
  ],
};
