/**
 * PostToolUse hook on Bash and PowerShell: after the main session runs
 * `gh pr create`, it reminds the session to hand the next spec to a fresh
 * session. On the backlog run (PR #163), 13 specs in one main context cost
 * 107M Opus tokens over 15 compactions. The spec, code map, plan, ledger and
 * follow-ups files already carry each spec's state.
 */
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = String(input.tool_input?.command ?? '');

if (!input.agent_type && /\bgh\s+pr\s+create\b/.test(command)) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          'PR opened. Before the next spec, ask the user to run /clear, so it starts in a fresh context ' +
          '(.claude/rules/repo/pipeline.md, "One spec, one main session"). A PR into dev ignores closing ' +
          'keywords: after the merge, close each fixed issue with `gh issue close <n>`.',
      },
    })
  );
}
