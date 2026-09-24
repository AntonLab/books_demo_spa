---
paths:
  - 'tsconfig.base.json'
  - '**/tsconfig*.json'
  - 'eslint.config.base.mjs'
  - '**/eslint.config.mjs'
  - 'package.json'
  - '*/package.json'
  - '.githooks/**'
  - 'scripts/**'
  - '.prettierrc.json'
  - '.prettierignore'
---

# Shared tooling

## `tsconfig.base.json`

- Every package's `tsconfig.json` extends it by relative path.
- It sets `noUncheckedIndexedAccess` for all three packages: an index read is
  `T | undefined`, application code handles the miss, and only test files
  assert it away with `!`.
- `erasableSyntaxOnly` and `verbatimModuleSyntax` hold everywhere, because
  Node strips types from the server and `shared` (ADR-0006); the client keeps
  the same rules so code moves between packages unchanged.
- `noImplicitReturns` and `noImplicitOverride`: a class member that overrides
  (only `ErrorBoundary`'s) says `override`.
- Left off on purpose: `noPropertyAccessFromIndexSignature` and
  `exactOptionalPropertyTypes`, each a hundred-odd edits for little caught.
- Keep `include`, `exclude` and `paths` out of it: TypeScript resolves them
  against the declaring file, so they would point at the repo root.

## `eslint.config.base.mjs`

- Exports `createConfig({ ignores, tsconfigRootDir }, ...packageConfigs)`,
  built with ESLint's `defineConfig`. Each package's own `eslint.config.mjs`
  calls it with `import.meta.dirname`, because ESLint does not search parent
  directories.
- The `**/*.{ts,tsx}` block turns on typed linting (`projectService`) for four
  rules: `no-floating-promises` (node:test's `test`/`describe`/`it`/`suite`
  exempt), `no-misused-promises`, `await-thenable` and
  `switch-exhaustiveness-check` (a `default:` does not cover a missing union
  member: write the `case`). JavaScript stays untyped. Growing this toward
  `recommendedTypeChecked` is a deliberate step, one measured rule at a time.
- `no-console` and `no-non-null-assertion` are errors; test files
  (`*.spec.ts`, `*.test.ts(x)`, `*.testkit.ts`, `src/test/`) may write `!`.
- The client config adds the rules `client/CLAUDE.md` lists: imports flow
  down the Atomic Design levels, components and pages import `@/api` only as
  types (plus `ApiError`), no default exports, no `React` default or namespace
  import, no global `fetch` outside `api/client`. `no-restricted-imports` takes
  one option set per file, so each level's block repeats the rules above it.
- Plugins resolve by bare specifier because the root `package.json` declares
  them and npm hoists them.

## Root `package.json`

Owns the devDependencies every package needs (eslint, `@eslint/js`,
typescript-eslint, eslint-config-prettier, globals, prettier, typescript), plus
`concurrently` and `skills`, and `engines.node`. `shared` defines only
`typecheck`, `lint` and `lint:fix`; `shared/src/wire.typetest.ts` pins
`Wire<T>` with type-level assertions that `typecheck` checks.

## Pre-commit hook (`.githooks/pre-commit`)

- Runs ESLint `--fix` per package, from inside it (flat config does not
  cascade, and that is what points typed linting at the package's tsconfig),
  routed by the staged path's `client/`, `server/` or `shared/` prefix. Then
  Prettier `--write` once from the root over every staged file. Re-stages what
  they rewrote; blocks on a surviving ESLint error; warnings pass.
- Refuses a partially staged file, since re-staging the rewritten copy would
  pull its unstaged hunks into the commit.
- If `node_modules/.bin` is missing it warns and lets the commit through.
- `core.hooksPath` is per-clone; the root `prepare` script sets it
  (`git config core.hooksPath .githooks` by hand).

## Commit-msg hook (`.githooks/commit-msg`)

Checks the subject against `^(feat|fix|refactor|chore|docs|test|ci)(\(scope\))?!?: `,
the types the root CLAUDE.md lists; add a type to both at once. Git's own
`Merge …` and `Revert "…"` subjects and `fixup!`/`squash!`/`amend!` pass.

## `.npmrc`

`engine-strict=true`: npm refuses to install on a Node below `engines.node`.

## `scripts/link-skills.mjs`

Plain Node with no dependencies; Prettier checks it, but no package's ESLint
config reaches it.
