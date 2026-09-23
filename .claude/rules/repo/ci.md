---
paths:
  - '.github/**'
  - '.nvmrc'
---

# GitHub Actions and branch protection

`dev` is the default and integration branch, `main` the release branch `dev`
merges into. Both run the same automation.

- `workflows/ci.yml` — on every PR into and push to `dev` or `main`, plus
  `workflow_dispatch`: five parallel jobs on `ubuntu-latest` with Node from
  `.nvmrc` — `lint` (`lint` and `format:check`), `typecheck`, `test-client`,
  `test-server`, `build`. `test-server` runs against a `mysql:8.4` service
  and sets `REQUIRE_MYSQL=1`, so a broken database fails the MySQL suites
  instead of leaving the job green with none of them run.
- `workflows/codeql.yml` — `security-extended` over `javascript-typescript`
  and `actions`, same triggers plus weekly, as `Analyze (javascript-typescript)`
  and `Analyze (actions)`. Test code (`*.spec.ts`, `*.test.ts(x)`,
  `*.testkit.ts`, `client/src/test/`) is excluded: it never deploys, and its
  one-middleware Express apps would be held to the real app's rules. The
  `CodeQL` check it also reports is not required.
- `dependabot.yml` — weekly npm and Actions updates, minor and patch grouped per
  ecosystem, majors one PR each, no labels (the labels are the triage roles).
  It ignores TypeScript 7 (a native compiler without the JavaScript API
  typescript-eslint and fork-ts-checker-webpack-plugin load) and ESLint /
  `@eslint/js` 10 (past what eslint-plugin-react and eslint-plugin-jsx-a11y
  support). Drop an entry once those catch up, then take the major by hand. It
  also holds `@types/node` to the `.nvmrc` major.
- **Every action is pinned to a full commit SHA** with its version in a trailing
  comment; Dependabot moves both. A tag can be re-pointed, a SHA cannot.

The ruleset `Protect dev and main` requires a PR (no approvals: one
maintainer), blocks force-pushes and deletion, and requires all seven checks;
admins may bypass it, and a branch need not be up to date to merge. **Checks
are matched by name**: renaming a job or the CodeQL matrix leaves the ruleset
waiting on a check that never reports, so update the ruleset in the same change.
