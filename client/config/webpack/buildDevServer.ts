import type { Configuration } from 'webpack-dev-server';

export const buildDevServer = (): Configuration => ({
  port: 3000,
  // Serve index.html for client-side routes instead of 404ing.
  historyApiFallback: true,
  // html-webpack-plugin emits public/index.html and public/favicon.svg;
  // everything else is bundled from src/, so there is no static passthrough
  // folder.
  static: false,
  client: { overlay: { warnings: false } },
  // Forwards API calls to the Express server (server/src/index.ts, port 4000)
  // so the browser only ever talks to one origin in development.
  proxy: [
    {
      context: ['/api'],
      target: 'http://localhost:4000',
      changeOrigin: true,
    },
  ],
});
