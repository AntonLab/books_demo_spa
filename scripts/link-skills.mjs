/**
 * Links every skill in skills-lock.json into .claude/skills/, the directory
 * Claude Code reads project skills from. `npm run skills` runs it right after
 * `skills experimental_install`.
 *
 * That restore writes .agents/skills/ only: it installs for the CLI's
 * "universal" agents, and Claude Code, whose directory is .claude/skills/, is
 * not one of them. Without this step a fresh clone would give Claude Code
 * none of the locked skills.
 *
 * Each link is a junction on Windows, which needs neither admin rights nor
 * Developer Mode, and a symlink elsewhere. Running it twice changes nothing.
 * A link is removed only when it points into .agents/skills/ and names no
 * locked skill, so a skill written straight into .claude/skills/ is left
 * alone.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = join(root, '.agents', 'skills');
const target = join(root, '.claude', 'skills');

// The CLI flattens a nested lock key (`group/skill`) into one directory name.
const locked = new Set(
  Object.keys(
    JSON.parse(readFileSync(join(root, 'skills-lock.json'), 'utf8')).skills
  ).map((key) => key.replaceAll('/', '-'))
);

// Which skill under .agents/skills/ a link points at, or null when it points
// anywhere else. `relative` ignores case on Windows, where the drive letter
// can come back as either `d:` or `D:`.
const linkedSkill = (path) => {
  const rel = relative(source, resolve(target, readlinkSync(path)));
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : null;
};

mkdirSync(target, { recursive: true });

let removed = 0;
for (const name of readdirSync(target)) {
  const path = join(target, name);
  if (!lstatSync(path).isSymbolicLink()) continue;
  const skill = linkedSkill(path);
  if (skill !== null && (skill !== name || !locked.has(name))) {
    unlinkSync(path);
    removed += 1;
  }
}

let linked = 0;
for (const name of locked) {
  const path = join(target, name);
  if (!existsSync(join(source, name))) {
    process.stderr.write(
      `link-skills: ${name} is locked but missing from .agents/skills/ — run \`npm run skills\`\n`
    );
    process.exitCode = 1;
    continue;
  }
  let stat = null;
  try {
    stat = lstatSync(path);
  } catch {
    // Nothing there yet.
  }
  if (stat?.isSymbolicLink() && linkedSkill(path) === name) continue;
  if (stat !== null) {
    process.stderr.write(
      `link-skills: .claude/skills/${name} exists and is not a link to .agents/skills/${name} — left alone\n`
    );
    process.exitCode = 1;
    continue;
  }
  symlinkSync(join(source, name), path, 'junction');
  linked += 1;
}

process.stdout.write(
  `link-skills: ${locked.size} locked, ${linked} linked, ${removed} stale removed\n`
);
