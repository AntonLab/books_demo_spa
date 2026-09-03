# books_demo_spa

A demo single-page application for browsing books: a React 19 + TypeScript
frontend and an Express 5 + Sequelize/MySQL API, kept in one repository as two
independent npm packages.

## Stack

| Layer    | Technology                                                                  |
| -------- | --------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Redux Toolkit, React Router 8, antd 6, webpack 5       |
| Backend  | Node.js >= 22.5, Express 5, Sequelize 6 (MySQL via `mysql2`), zod, argon2    |
| Tooling  | ESLint 9 (flat config), Prettier, Jest (client), `node:test` (server)        |

## Layout

```
client/   React SPA bundled with webpack 5   — see client/CLAUDE.md
server/   Express API on Sequelize/MySQL     — see server/CLAUDE.md
```

There is no root `package.json`: install and run each package from its own
directory.

## Prerequisites

- Node.js >= 22.5 (the server runs TypeScript directly via Node's native
  type-stripping)
- A running MySQL server

## Getting started

### 1. Server

```bash
cd server
npm install
cp .env.example .env.local   # then fill in DB_USER / DB_PASSWORD
npm run start:dev            # http://localhost:4000
```

On start-up (outside `NODE_ENV=production`) the server creates the
`books_demo_spa` schema if it is missing and syncs the Sequelize models, so a
clean MySQL install needs no manual migration step.

### 2. Client

```bash
cd client
npm install
npm run dev                  # http://localhost:3000
```

The dev server proxies `/api` to `http://localhost:4000`, so the browser only
ever talks to one origin in development.

## Environment

`server/.env.local` (git-ignored) supplies the configuration; it is validated
with zod at start-up, so a malformed value fails loudly instead of booting a
broken server.

| Variable                  | Default                 | Notes                                                     |
| ------------------------- | ----------------------- | --------------------------------------------------------- |
| `NODE_ENV`                | `development`           | `development` \| `test` \| `production`                   |
| `PORT`                    | `4000`                  | The API's port                                            |
| `DB_HOST` / `DB_PORT`     | `127.0.0.1` / `3306`    |                                                           |
| `DB_NAME`                 | `books_demo_spa`        |                                                           |
| `DB_USER` / `DB_PASSWORD` | _(none)_                | Required — no default, on purpose. An empty password is accepted, a missing one is not. |
| `APP_BASE_URL`            | `http://localhost:3000` | Client origin used to build password-reset links          |

## API

Everything is mounted under `/api`:

| Prefix          | Resource                                                       |
| --------------- | -------------------------------------------------------------- |
| `/api/auth`     | `register`, `login`, `logout`, `me`, `password-reset/request`, `password-reset/confirm` |
| `/api/users`    | CRUD (both reads require a session)                            |
| `/api/series`   | CRUD                                                           |
| `/api/books`    | CRUD                                                           |
| `/api/chapters` | CRUD                                                           |
| `/api/likes`    | CRUD (a like points at exactly one of a book or a comment)      |

Authentication is session-based: an opaque token in an httpOnly `sid` cookie,
stored hashed. `GET`s are public except on `/api/users`; every `POST`, `PATCH`
and `DELETE` requires a session. Row ownership is deliberately not enforced —
a signed-in user may write another user's rows, which is out of scope for the
demo.

Password-reset links are not emailed: the only delivery implemented writes the
link to the server log, so copy it from there when exercising the flow.

A `Comment` model exists (with self-referential replies) but has no HTTP API yet.

## Scripts

Run from within `client/` or `server/`.

| Script                 | client                              | server                             |
| ---------------------- | ----------------------------------- | ---------------------------------- |
| `npm run dev`          | webpack dev server on :3000         | —                                  |
| `npm start`            | —                                   | run the API                        |
| `npm run start:dev`    | —                                   | run the API under nodemon          |
| `npm run build`        | production bundle into `build/`     | `tsc` output into `dist/`          |
| `npm test`             | Jest + React Testing Library (jsdom)| `node:test` (includes MySQL-backed integration specs) |
| `npm run typecheck`    | `tsc --noEmit`                      | `tsc --noEmit`                     |
| `npm run lint`         | ESLint                              | ESLint                             |
| `npm run format:check` | Prettier                            | Prettier                           |

`npm run lint:fix` and `npm run format` apply fixes. `client` also has
`npm run test:watch`.

The server's test suite talks to a real MySQL database, so `.env.local` must be
configured before `npm test` there.

## Quality gates

Before committing, run `npm run typecheck`, `npm run lint`,
`npm run format:check` and `npm test` in each package you touched. Commit
messages follow the conventional-commit prefixes (`feat:`, `fix:`, `chore:`,
`docs:`, `test:`).
