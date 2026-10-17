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

## Server

- No synchronous filesystem API (`readFileSync`, `writeFileSync`, `existsSync`
  and the like) in a request handler or anything it calls. Startup code may
  use them. Blocks a merge.

## Components

- Function components only. The one exception is the client's
  `ErrorBoundary` (React has no hook for `getDerivedStateFromError`); do not
  add a dependency to dodge it.
