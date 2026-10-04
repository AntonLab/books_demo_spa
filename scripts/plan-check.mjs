// Usage: node scripts/plan-check.mjs <plan.md>
// Fails when a plan carries implementation bodies: plan-writer ignored the
// "Contracts, Not Code" prose rule, so the rule became an exit code. A block
// counts as a test when it calls test/it/describe/expect; tests stay complete,
// anything else must fit in MAX_LINES.
// It also caps a task at MAX_TASK_LINES, since a 237-line task slipped past the
// prose limit of "about 150". The cap leaves that "about" some room: a
// 160-line task was fine.
import { readFileSync } from 'node:fs';

const MAX_LINES = 15;
const MAX_TASK_LINES = 180;
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
let taskStart = -1;

const closeTask = (end) => {
  if (taskStart >= 0 && end - taskStart > MAX_TASK_LINES) {
    offenders.push(
      `${planPath}:${taskStart + 1} ${task}: ${end - taskStart} lines, over ${MAX_TASK_LINES}; split it into two tasks`
    );
  }
  taskStart = -1;
};

lines.forEach((line, index) => {
  const heading = /^### (Task \d+.*)/.exec(line);
  if (!fence && /^##{1,2} /.test(line)) closeTask(index);
  if (!fence && heading) {
    closeTask(index);
    task = heading[1];
    taskStart = index;
  }
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
closeTask(lines.length);

if (offenders.length) {
  console.log(offenders.join('\n'));
  console.log(
    `plan-check: ${offenders.length} problem(s). A non-test block over ${MAX_LINES} lines becomes ` +
      'behavior bullets and a "Mirror path:lines" pointer (keep signatures and types); ' +
      `a task over ${MAX_TASK_LINES} lines becomes two tasks.`
  );
  process.exit(1);
}
console.log('plan-check: OK');
