# books_demo_spa

A demo single-page application for browsing books: a React 19 + TypeScript
frontend and an Express 5 + Sequelize/MySQL API, kept in one repository as two
npm workspaces.

## Stack

| Layer    | Technology                                                                |
| -------- | ------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Redux Toolkit, React Router 8, antd 6, webpack 5    |
| Backend  | Node.js >= 22.5, Express 5, Sequelize 6 (MySQL via `mysql2`), zod, argon2 |
| Tooling  | ESLint 9 (flat config), Prettier, Jest (client), `node:test` (server)     |

## Layout

```
client/   React SPA bundled with webpack 5   — see client/CLAUDE.md
server/   Express API on Sequelize/MySQL     — see server/CLAUDE.md
```

One root `package.json` declares both as npm workspaces, so a single
`npm install` at the repo root covers the whole repo and writes one lockfile.

## Prerequisites

- Node.js >= 22.5 (the server runs TypeScript directly via Node's native
  type-stripping)
- A running MySQL server

## Getting started

```bash
npm install                            # once, from the repo root
cp server/.env.example server/.env.local   # then fill in DB_USER / DB_PASSWORD
npm run dev                            # both, on :3000 and :4000
```

`npm run dev` runs the webpack dev server and the API side by side under
`concurrently`, with each process's output prefixed by name; Ctrl-C stops both.
To run just one, use `npm run dev -w client` or `npm run dev -w server`.

The client dev server proxies `/api` to `http://localhost:4000`, so the browser
only ever talks to one origin in development.

On start-up (outside `NODE_ENV=production`) the server creates the
`books_demo_spa` schema if it is missing and syncs the Sequelize models, so a
clean MySQL install needs no manual migration step.

## Environment

`server/.env.local` (git-ignored) supplies the configuration; it is validated
with zod at start-up, so a malformed value fails loudly instead of booting a
broken server.

| Variable                  | Default                 | Notes                                                                                   |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development`           | `development` \| `test` \| `production`                                                 |
| `PORT`                    | `4000`                  | The API's port                                                                          |
| `DB_HOST` / `DB_PORT`     | `127.0.0.1` / `3306`    |                                                                                         |
| `DB_NAME`                 | `books_demo_spa`        |                                                                                         |
| `DB_USER` / `DB_PASSWORD` | _(none)_                | Required — no default, on purpose. An empty password is accepted, a missing one is not. |
| `APP_BASE_URL`            | `http://localhost:3000` | Client origin used to build password-reset links                                        |

## API

Everything is mounted under `/api`:

| Prefix          | Resource                                                                                |
| --------------- | --------------------------------------------------------------------------------------- |
| `/api/auth`     | `register`, `login`, `logout`, `me`, `password-reset/request`, `password-reset/confirm` |
| `/api/users`    | CRUD (both reads require a session)                                                     |
| `/api/series`   | CRUD                                                                                    |
| `/api/books`    | CRUD                                                                                    |
| `/api/chapters` | CRUD                                                                                    |
| `/api/likes`    | CRUD (a like points at exactly one of a book or a comment)                              |

Authentication is session-based: an opaque token in an httpOnly `sid` cookie,
stored hashed. `GET`s are public except on `/api/users`; every `POST`, `PATCH`
and `DELETE` requires a session. Row ownership is deliberately not enforced —
a signed-in user may write another user's rows, which is out of scope for the
demo.

Password-reset links are not emailed: the only delivery implemented writes the
link to the server log, so copy it from there when exercising the flow.

A `Comment` model exists (with self-referential replies) but has no HTTP API yet.

## Scripts

Run these from the repo root.

| Script                 | Does                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | client on :3000 and server on :4000 together, under `concurrently`  |
| `npm run build`        | both: client bundle into `client/build/`, `tsc` into `server/dist/` |
| `npm test`             | both: Jest (client) and `node:test` (server)                        |
| `npm run typecheck`    | both: `tsc --noEmit`                                                |
| `npm run lint`         | both: ESLint                                                        |
| `npm run format:check` | Prettier over the whole repo                                        |

`npm run lint:fix` and `npm run format` apply fixes.

Every script except the Prettier pair fans out over both workspaces; target one
with npm's `-w` flag (`npm run dev -w client`, `npm run build -w server`). The
root deliberately defines no single-package aliases, so `-w` is the one way to
narrow any script. Prettier is root-only because its config is repo-wide — the
packages define no `format` script.

The API alone, without nodemon, is `npm run start -w server`. `client` also has
`npm run test:watch`.

The server's test suite talks to a real MySQL database, so `.env.local` must be
configured before `npm test` there.

## Quality gates

Before committing, run `npm run typecheck`, `npm run lint`,
`npm run format:check` and `npm test` from the repo root; each covers both
workspaces. Commit messages follow the conventional-commit prefixes (`feat:`,
`fix:`, `chore:`, `docs:`, `test:`).

### Pre-commit hook

`.githooks/pre-commit` lints and formats the staged files on every commit:
ESLint `--fix` and Prettier `--write`, re-staged automatically, with the commit
blocked if an ESLint error survives the fix. `npm install` turns it on via the
root `prepare` script; to enable it by hand:

```bash
git config core.hooksPath .githooks
```

Skip it for a single commit with `git commit --no-verify`. It does not run
`typecheck` or the tests, so the gates above still apply.
