/**
 * PreToolUse hook on Bash and PowerShell: refuses the shell commands that the
 * repo's prose rules forbid but agents ran anyway. A session diagnosis of the
 * work-modals run (PR #152) found `sed -i`, heredocs appended to plans,
 * `printf >>` into the SDD ledger, a `find` over the whole drive, and full
 * gate runs in the main session, each against a written rule. A refusal costs
 * the agent one turn; a prose rule cost nothing to ignore.
 *
 * The check reads the command text only. A redirect into a temp or scratchpad
 * path, `/dev/null` or `$null` passes: logs there are not repo files and skip
 * no Prettier hook. Anything the hook misreads can still run from a terminal.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = String(input.tool_input?.command ?? '');
const inSubagent = Boolean(input.agent_type);
// A heredoc body is stdin data: a PR body naming `npm run typecheck` was
// refused as a gate run, and an apostrophe in prose unbalanced the quote
// stripping below. A body that a shell or interpreter executes stays code.
const stripHeredocs = (text) => {
  const kept = [];
  let terminator = null;
  for (const line of text.split('\n')) {
    if (terminator) {
      if (line.trim() !== terminator) continue;
      terminator = null;
    }
    kept.push(line);
    const opener = line.match(/(?<!<)<<(?!<)-?\s*(['"]?)(\w+)\1/);
    if (opener && !/\b(bash|sh|zsh|node|python3?|py|deno|bun)\b/.test(line))
      terminator = opener[2];
  }
  return kept.join('\n');
};
const code = stripHeredocs(command);
// Quoted text is data (a commit message naming `sed -i`), except a quoted
// redirect target, which is still a file the command writes.
const bare = code.replace(/(>>?\s*)?("[^"]*"|'[^']*')/g, (match, redirect) =>
  redirect ? match : '""'
);
const RUNS_SCRIPT = /\b(node|python3?|py|deno|bun)\b/;

const SCRATCH = /^["']?(\/dev\/null|\$null|nul|.*(tmp|temp|scratchpad)[\\/])/i;
const PATH_LIKE = /^["']?[\w$~.\\/:-]*[.\\/][\w$~.\\/:-]*["']?$/;

const writeTargets = () => {
  const targets = [];
  // `=>` and `->` are code, `2>&1` and `>&2` are stream merges, not files.
  for (const m of bare.matchAll(/(?<![=\-<>&])\d?>>?(?!&)\s*([^\s;|&)<>]+)/g))
    targets.push(m[1]);
  for (const m of bare.matchAll(/\btee\s+(?:-a\s+)?([^\s;|&)]+)/g))
    targets.push(m[1]);
  // A draft written in /tmp and copied over a plan slipped past the redirect
  // check on the backlog run; the destination is the last operand. `git mv`
  // is a tracked rename, not a copy past the hook. The `cp` itself must be
  // bare (not inside a commit message), but its operands are read with their
  // quotes kept, since a quoted destination is still a file it writes.
  const COPY = /(?<!git\s+)\b(?:cp|mv)\s+([^;|&]+)/g;
  if (bare.search(COPY) !== -1) {
    const unquoted = code.replace(/"([^"]*)"|'([^']*)'/g, (_, a, b) =>
      (a ?? b).replace(/\s/g, '_')
    );
    for (const m of unquoted.matchAll(COPY)) {
      const operands = m[1]
        .trim()
        .split(/\s+/)
        .filter((a) => !a.startsWith('-'));
      if (operands.length >= 2) targets.push(operands.at(-1));
    }
  }
  for (const m of bare.matchAll(
    /\b(?:Set-Content|Add-Content|Out-File)\b[^;|]*?(?:-(?:Path|FilePath)\s+)?(["']?[A-Za-z]?:?[\w$~.\\/-]+["']?)/gi
  ))
    targets.push(m[1]);
  return targets.filter((t) => PATH_LIKE.test(t) && !SCRATCH.test(t));
};

const rules = [
  [
    /\bsed\b[^|;&]*\s(-[a-zA-Z]*i\b|--in-place)/,
    '`sed -i` edits a file in place and skips the Prettier hook. Change files with Edit.',
  ],
  [
    /\b(writeFileSync|appendFileSync|write_text|writelines)\b|\bopen\([^)]*,\s*["'][wa]/,
    'A script that writes files skips the Prettier hook and is invisible to review. Use Write or Edit.',
  ],
  [
    /\bfind\s+(["']?\/[a-zA-Z]?["']?|["']?[A-Za-z]:[\\/]?["']?)(\s|$)/,
    '`find` over a drive root walks the whole disk. Search the repo with Glob or `git grep -n`.',
  ],
];

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `guard-shell: ${reason}`,
      },
    })
  );
  process.exit(0);
};

const [inPlace, scriptWrite, driveFind] = rules;
if (inPlace[0].test(bare)) deny(inPlace[1]);
// A script's body is quoted, so this one reads the whole command.
if (RUNS_SCRIPT.test(bare) && scriptWrite[0].test(code)) deny(scriptWrite[1]);
if (driveFind[0].test(bare)) deny(driveFind[1]);

// `dev` and `main` change only through a PR. The ruleset lets an admin push
// past it, and a session once synced main into dev with a direct push, so the
// hook refuses a push whose destination is either branch, a sync included.
// A push with no refspec, or to `HEAD`, goes to the current branch.
const PROTECTED = new Set(['dev', 'main']);
const branchIn = (dir) => {
  try {
    return execFileSync('git', ['-C', dir, 'branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
};
const pushesProtected = () => {
  for (const m of bare.matchAll(/\bgit\s+(?:-C\s+(\S+)\s+)?push\b([^;&|]*)/g)) {
    // A quoted `-C` path is blanked in `bare`; fall back to the session's cwd.
    const dir = m[1] && m[1] !== '""' ? m[1] : (input.cwd ?? '.');
    const args = m[2].trim().split(/\s+/).filter(Boolean);
    if (args.includes('--all') || args.includes('--mirror')) return true;
    const refspecs = args.filter((a) => !a.startsWith('-')).slice(1);
    if (!refspecs.length && PROTECTED.has(branchIn(dir))) return true;
    for (const spec of refspecs) {
      const dest = spec
        .replace(/^\+/, '')
        .split(':')
        .at(-1)
        .replace(/^refs\/heads\//, '');
      if (PROTECTED.has(dest === 'HEAD' ? branchIn(dir) : dest)) return true;
    }
  }
  return false;
};
if (pushesProtected())
  deny(
    '`dev` and `main` change only through a PR, a main→dev sync included. Push a feature branch and open a PR; ' +
      'if a protection rule or permission blocks that, stop and ask the user. Never work around it.'
  );

const targets = writeTargets();
if (targets.length)
  deny(
    `the command writes ${targets.join(', ')} through the shell. Create and change repo files with Write/Edit; ` +
      'append SDD ledger lines with `bash scripts/sdd-step.sh next`; send logs to the scratchpad or `| tail`.'
  );

// The main session reads only failures: gate-runner keeps passing output out
// of its context. A focused run (`npm test -w client -- <path>`) passes.
if (
  !inSubagent &&
  /\bnpm\s+(run\s+)?(typecheck|lint|format:check|test)(?![\w:-])(?![^;&|]*\s--\s)/.test(
    bare
  )
)
  deny(
    'the main session runs no package-wide gate. Dispatch `gate-runner` (model haiku) and pass its `gates green at <sha>` on.'
  );
