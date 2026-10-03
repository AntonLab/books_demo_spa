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
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = String(input.tool_input?.command ?? '');
const inSubagent = Boolean(input.agent_type);
// Quoted text is data (a commit message naming `sed -i`), except a quoted
// redirect target, which is still a file the command writes.
const bare = command.replace(
  /(>>?\s*)?("[^"]*"|'[^']*')/g,
  (match, redirect) => (redirect ? match : '""')
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
    const unquoted = command.replace(/"([^"]*)"|'([^']*)'/g, (_, a, b) =>
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
if (RUNS_SCRIPT.test(bare) && scriptWrite[0].test(command))
  deny(scriptWrite[1]);
if (driveFind[0].test(bare)) deny(driveFind[1]);

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
