// Usage: node scripts/tokens.mjs <session-id> [from-ISO] [to-ISO]
// Token tally for one Claude Code session of this repo: the main transcript
// plus every subagent under it. It sums `message.usage` (input, cache write,
// cache read, output) once per `message.id`, since a response with several
// content blocks is logged once per block. It prints totals per subagent role
// and model, and the main session's compactions. It reads transcripts only and
// prints counters, never record bodies: one transcript line can be a megabyte.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [id, from, to] = process.argv.slice(2);
if (!id) {
  console.error(
    'usage: node scripts/tokens.mjs <session-id> [from-ISO] [to-ISO]'
  );
  process.exit(2);
}
const after = from ? Date.parse(from) : -Infinity;
const until = to ? Date.parse(to) : Infinity;

const projects = join(homedir(), '.claude', 'projects');
const project = readdirSync(projects).find((p) =>
  existsSync(join(projects, p, `${id}.jsonl`))
);
if (!project) {
  console.error(`tokens: no transcript ${id}.jsonl under ${projects}`);
  process.exit(1);
}
const base = join(projects, project, id);

const tally = (file) => {
  const seen = new Set();
  const out = { total: 0, calls: 0, models: new Set(), compactions: [] };
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const at = Date.parse(record.timestamp ?? '');
    if (!(at > after && at <= until)) continue;
    if (record.subtype === 'compact_boundary')
      out.compactions.push(record.compactMetadata?.preTokens);
    const usage = record.message?.usage;
    if (record.type !== 'assistant' || !usage || seen.has(record.message.id))
      continue;
    seen.add(record.message.id);
    out.total +=
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.output_tokens ?? 0);
    out.calls++;
    out.models.add(record.message.model);
  }
  return out;
};

const millions = (n) => `${(n / 1e6).toFixed(2)}M`;
const main = tally(`${base}.jsonl`);
const roles = new Map();
const subagents = join(base, 'subagents');
for (const file of existsSync(subagents) ? readdirSync(subagents) : []) {
  if (!file.endsWith('.jsonl')) continue;
  const metaPath = join(subagents, file.replace(/\.jsonl$/, '.meta.json'));
  const role = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, 'utf8')).agentType
    : 'unknown';
  const run = tally(join(subagents, file));
  if (!run.calls) continue;
  const key = `${role} (${[...run.models].filter((m) => m !== '<synthetic>').join(', ')})`;
  const row = roles.get(key) ?? { runs: 0, total: 0, max: 0 };
  row.runs++;
  row.total += run.total;
  row.max = Math.max(row.max, run.total);
  roles.set(key, row);
}

const rows = [...roles].sort((a, b) => b[1].total - a[1].total);
const subTotal = rows.reduce((sum, [, row]) => sum + row.total, 0);
console.log(
  `main: ${millions(main.total)} in ${main.calls} responses, ` +
    `${main.compactions.length} compactions`
);
for (const [key, row] of rows)
  console.log(
    `${key}: ${millions(row.total)} in ${row.runs} runs, largest ${millions(row.max)}`
  );
console.log(
  `subagents: ${millions(subTotal)}; total: ${millions(subTotal + main.total)}`
);
