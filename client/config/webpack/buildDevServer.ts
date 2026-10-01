import type { Configuration } from 'webpack-dev-server';

// The server reads the same two variables (server/src/db/config.ts), so one
// `PORT=4100 APP_BASE_URL=http://localhost:3100 npm run dev` moves both and
// runs beside a dev server already on 3000; ui-checker relies on it.
const clientPort = Number(
  new URL(process.env.APP_BASE_URL ?? 'http://localhost:3000').port || 3000
);
const apiPort = Number(process.env.PORT ?? 4000);

export const buildDevServer = (): Configuration => ({
  port: clientPort,
  // Serve index.html for client-side routes instead of 404ing.
  historyApiFallback: true,
  // html-webpack-plugin emits public/index.html and public/favicon.svg;
  // everything else is bundled from src/, so there is no static passthrough
  // folder.
  static: false,
  client: { overlay: { warnings: false } },
  // Forwards API calls to the Express server (server/src/index.ts) so the
  // browser only ever talks to one origin in development.
  proxy: [
    {
      context: ['/api'],
      target: `http://localhost:${apiPort}`,
      changeOrigin: true,
    },
  ],
});
