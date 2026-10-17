/**
 * SessionStart preflight: names the environment gaps that used to surface only
 * as failed runs. A worktree without `server/.env.local` failed 13 server
 * tests, `npm install` failed on Node 25, and a stopped MySQL left the search
 * feature's server suites unrun. A queue ran with no Playwright MCP after the
 * project `.mcp.json` was dropped, so every `ui-checker` run was BLOCKED.
 *
 *   node scripts/preflight.mjs
 *
 * Prints one line per gap and nothing when ready; always exits 0, so a
 * session is never blocked.
 */
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
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

// `ui-checker` calls the swarm plugin's own server
// (`mcp__plugin_swarm_playwright__*`); a `playwright` server in another scope
// gives other tool names and starts a second browser.
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
};
const norm = (path) => {
  const full = resolve(path).replace(/\\/g, '/');
  return process.platform === 'win32' ? full.toLowerCase() : full;
};
// A worktree under `.claude/worktrees/` is covered by its main checkout.
const covers = (dir) =>
  norm(root) === norm(dir) || norm(root).startsWith(`${norm(dir)}/`);
const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
const claudeJson = readJson(
  process.env.CLAUDE_CONFIG_DIR
    ? join(process.env.CLAUDE_CONFIG_DIR, '.claude.json')
    : join(homedir(), '.claude.json')
);
const others = [];
if (readJson(join(root, '.mcp.json')).mcpServers?.playwright)
  others.push('project `.mcp.json`');
if (claudeJson.mcpServers?.playwright) others.push('user scope');
if (
  Object.entries(claudeJson.projects ?? {}).some(
    ([dir, project]) => covers(dir) && project.mcpServers?.playwright
  )
)
  others.push('local scope');
const swarm = Object.entries(
  readJson(join(configDir, 'plugins', 'installed_plugins.json')).plugins ?? {}
)
  .filter(([key]) => key.startsWith('swarm@'))
  .flatMap(([, installs]) => installs)
  .filter((install) => !install.projectPath || covers(install.projectPath));
const fromPlugin = swarm.some(
  (install) =>
    readJson(join(install.installPath, '.mcp.json')).mcpServers?.playwright
);
const restart = 'then restart Claude Code (`/clear` keeps the old MCP servers)';
if (!fromPlugin)
  gaps.push(
    `The swarm plugin brings no Playwright MCP, so \`ui-checker\` reports BLOCKED: update swarm to 1.2.0 or later, ${restart}.`
  );
else if (others.length)
  gaps.push(
    `Playwright MCP is set up twice, by the swarm plugin and in the ${others.join(', ')}: remove the second (\`claude mcp remove playwright -s <scope>\` or the \`.mcp.json\` entry), ${restart}.`
  );

if (gaps.length) console.log(`preflight:\n- ${gaps.join('\n- ')}`);
