/**
 * SessionStart preflight: names the environment gaps that used to surface only
 * as failed runs. A worktree without `server/.env.local` failed 13 server
 * tests, `npm install` failed on Node 25, and a stopped MySQL left the search
 * feature's server suites unrun.
 *
 *   node scripts/preflight.mjs
 *
 * Prints one line per gap and nothing when ready; always exits 0, so a
 * session is never blocked.
 */
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const gaps = [];

const reachable = (host, port) =>
  new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 1500 });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });

const wanted = readFileSync(join(root, '.nvmrc'), 'utf8')
  .trim()
  .replace(/^v/, '')
  .split('.')[0];
const running = process.versions.node.split('.')[0];
if (running !== wanted)
  gaps.push(
    `Node ${process.versions.node} runs, \`.nvmrc\` wants ${wanted}: run \`nvm use ${wanted}\`.`
  );

const envFile = join(root, 'server/.env.local');
if (!existsSync(envFile)) {
  gaps.push(
    '`server/.env.local` is missing, so the MySQL suites cannot run. Create worktrees with `npm run worktree`, which copies it.'
  );
} else {
  const env = parseEnv(readFileSync(envFile, 'utf8'));
  const host = env.DB_HOST || '127.0.0.1';
  const port = Number(env.DB_PORT || 3306);
  if (!(await reachable(host, port)))
    gaps.push(
      `MySQL at ${host}:${port} does not answer. Start it before server tests or the app.`
    );
}

if (gaps.length) console.log(`preflight:\n- ${gaps.join('\n- ')}`);
