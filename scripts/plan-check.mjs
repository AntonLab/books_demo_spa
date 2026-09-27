// Usage: node scripts/plan-check.mjs <plan.md>
// Fails when a plan carries implementation bodies. plan-writer ignored the
// "Contracts, Not Code" prose rule on its first real run, so the rule became
// an exit code. A block counts as a test when it calls test/it/describe/expect;
// tests stay complete, anything else must fit in MAX_LINES.
import { readFileSync } from 'node:fs';

const MAX_LINES = 15;
const TEST_CALL = /\b(test|it|describe|expect)(\.\w+)?\(/;

const [planPath] = process.argv.slice(2);
if (!planPath) {
  console.error('usage: node scripts/plan-check.mjs <plan.md>');
  process.exit(2);
}

const lines = readFileSync(planPath, 'utf8').split('\n');
const offenders = [];
let task = '(header)';
let fence = null;
let block = [];
let start = 0;

lines.forEach((line, index) => {
  const heading = /^### (Task \d+.*)/.exec(line);
  if (!fence && heading) task = heading[1];
  const marker = /^(`{3,})/.exec(line);
  if (!marker) {
    if (fence) block.push(line);
    return;
  }
  if (!fence) {
    fence = marker[1];
    block = [];
    start = index + 1;
  } else if (marker[1] === fence) {
    fence = null;
    if (block.length > MAX_LINES && !TEST_CALL.test(block.join('\n'))) {
      offenders.push(
        `${planPath}:${start} ${task}: ${block.length}-line non-test block`
      );
    }
  }
});

if (offenders.length) {
  console.log(offenders.join('\n'));
  console.log(
    `plan-check: ${offenders.length} block(s) over ${MAX_LINES} lines that are not tests. ` +
      'Replace each with behavior bullets and a "Mirror path:lines" pointer; keep signatures and types.'
  );
  process.exit(1);
}
console.log('plan-check: OK');
