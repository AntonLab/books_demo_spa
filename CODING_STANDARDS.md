# Coding Standards

Read only by `swarm:sdd-task-reviewer` and `swarm:sdd-final-reviewer`, which
check each diff against these rules and cite the rule in a finding.
Implementers do not read this file. Rules that lint, typecheck or format
enforce do not belong here: add the lint rule instead.

A breach is Minor unless its rule says it blocks a merge.

## Comments

- A comment says why, what breaks otherwise, or which upstream bug it works
  around. A comment that says _what_ the code does is a finding: rename the
  code instead.

## State

- No direct mutation of React state, a store or a prop: build a new value.
  Blocks a merge.

## Lint disables

- An `eslint-disable` for the server's sync-call rule is a finding unless the
  call runs once at startup, never on a request path, and the comment says so.
