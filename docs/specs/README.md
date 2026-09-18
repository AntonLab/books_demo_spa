# Living specs

What the system does **now**, one spec per capability: who may do what, which
status code comes back, what a reader sees. A feature changes its specs first
and the code follows; the steps are under **Workflow** in the root `CLAUDE.md`.
The words come from the glossary, [`CONTEXT.md`](../../CONTEXT.md), and the
decisions behind the rules from [`docs/adr/`](../adr/). The migration moves
one capability at a time: until a capability has a row in the
[Index](#index) below, its behaviour is still described in the package
`CLAUDE.md` files, which otherwise keep the engineering guide only — layout,
commands, conventions and tests.

`npm run specs:check` holds every citation in the repo to these specs; see
[The check](#the-check).

## Index

| Capability | Prefix | Summary |
| ---------- | ------ | ------- |

A capability gets its row here, linked to its spec, in the PR that writes it.
Its prefix is already reserved under
[Capabilities and prefixes](#capabilities-and-prefixes). Until then, its
behaviour is still described in the package `CLAUDE.md` files.

## Format

Each capability is one folder, `docs/specs/<capability>/spec.md`, laid out like
this. The example borrows the Books capability's content but uses the prefix
`EX`, which is reserved for examples: no spec may declare it, so
`specs:check` never reads an example as a citation.

```markdown
# Books

Prefix: `EX` · Glossary: Book, Book status, Draft book, Published (CONTEXT.md) · ADRs: 0005

One paragraph: what this capability is for.

## Requirements

### API

**EX-1** — A new Book is a Draft book: `POST /api/books` takes no status.

**EX-2** — A Draft book is readable only by its Co-authors and Moderators;
anyone else gets 404, the same answer as for a missing Book.
_Why:_ a 403 would confirm that the Book exists.

### UI

**EX-3** — …

## Out of scope

- A Cover on a Series — the public Series page is still a stub (#47 tracks
  additional materials).

## Implementation

_Informative. The Requirements above are the contract; this section says where
and how the code meets it._

- `repositories/visibility.ts` — `readableBookWhere(viewer)` is the one
  definition every read that can reach a Book goes through…
```

- The header line names the prefix, the glossary terms the spec relies on, and
  the ADRs it rests on. `specs:check` reads the prefix from it, so it starts
  with `` Prefix: `<PREFIX>` `` exactly.
- The text uses the vocabulary of `CONTEXT.md` and avoids the synonyms it lists
  under _Avoid_.

### Requirements

A requirement is one testable statement in the present tense, starting with its
bold ID and an em dash, on a line of its own. An optional `_Why:_` line follows
when the rule would surprise a reader. A reason that is hard to reverse,
surprising and a real trade-off is an ADR instead, and the requirement links
it.

GIVEN/WHEN/THEN scenarios appear only where the boundary is not obvious from
the statement — the order of 401, 404 and 403, the transitions of a
Publication time, the rank rule between Admin and Superadmin. They follow the
requirement as a list:

```markdown
**EX-4** — A Scheduled chapter becomes Published when its Publication time
passes, with no further save.

- GIVEN a Scheduled chapter of a Published Book
- WHEN its Publication time passes
- THEN a Guest's list of the Book's chapters includes it
```

### Surfaces

A capability is cross-stack. `### API` holds what the server answers, `### UI`
what the client shows and lets a person do. A rule that shows on both surfaces
is stated once, where it originates; the other surface gets an ID of its own
only if it adds something, and cites the first.

### IDs

- An ID is `<PREFIX>-<n>`, unique across the repo. `### API` and `### UI` share
  one sequence per prefix.
- Numbers are assigned in order of writing, never reused and never
  renumbered.
- An edit that only rewords a requirement keeps its ID; a change to what it
  demands retires the old ID and adds a new one.
- A requirement that stops applying stays where it is, retired:

  ```markdown
  **EX-9** — _Retired 2026-10-01: replaced by EX-31._
  ```

  An old citation then never silently points at a different rule. Only
  `docs/specs/` may still cite a Retired ID, and retiring one re-points every
  other citation of it — comments and test titles — in the same commit, so
  `specs:check` stays green between tasks.

### Out of scope

`## Out of scope` lists deliberate refusals an agent might otherwise
"helpfully" add, each with a reason or an issue link. Behaviour never goes
here: "the reset link is written to the server log, not emailed" is a
requirement.

### Implementation

`## Implementation` is informative: the data model, the module that enforces
each rule, and why a mechanism was chosen (a row lock, a `silent` update,
`DATETIME(3)`). It names files and functions, and the last task of every
feature that touches the capability brings it up to date. Engineering
conventions that span capabilities — Express 5 notes, Sequelize conventions,
Atomic Design, test layers — stay in the package `CLAUDE.md`.

## Capabilities and prefixes

| Capability           | Prefix  | Covers                                                                                               |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `accounts`           | `ACC`   | registration, profile, Blocked/Pending, deletion, Role changes, the Admin/Superadmin rank rule       |
| `sessions`           | `SESS`  | login, logout, me, password reset, sessions ended on block and password change, cookie, login timing |
| `access-control`     | `PERM`  | Role × Scope, the matrix, 401 vs 403, 404 before 403, Moderator                                      |
| `request-security`   | `SEC`   | CSRF: Origin / `Sec-Fetch-Site`, `X-XSRF-Token`                                                      |
| `books`              | `BOOK`  | CRUD, Book status, Draft book visibility, `?q=` / `?userId=`                                         |
| `chapters`           | `CHAP`  | Publication time, Reading order, 409 on a concurrent save                                            |
| `series`             | `SER`   | Series order, a Series' books for its Co-authors                                                     |
| `co-authors`         | `COAU`  | credits on Books and Series, at least one, Moderators never change credits, last-Co-author deletion  |
| `comments`           | `CMT`   | threads, Tombstones, restore                                                                         |
| `likes`              | `LIKE`  | exactly one of a Book or a Comment, no self-like                                                     |
| `notifications`      | `NOTIF` | when they are written, the title and name snapshot                                                   |
| `covers-and-avatars` | `IMG`   | shared acceptance, re-encoding and serving rules                                                     |

The capability is `accounts`, not `users`: `CONTEXT.md` avoids "User" for a
registered person in general. `/api/users` keeps its path. The demo seed is a
development tool and stays in `server/CLAUDE.md`.

## Citing requirements

- **Code comments.** A comment that restates a business rule shrinks to a
  one-line gist plus the ID: `// EX-12: nobody changes their own status.` A
  comment that explains the code itself ("the Express 5 router calls
  `next(err)` itself") stays as it is. A comment that contradicts the spec is
  raised as a finding, never silently rewritten to match. The same holds for
  comments in test files.
- **Tests.** A test that pins a requirement names it at the start of its
  `test(…)` / `it(…)` title — `test('EX-2: a Draft book is 404 to a Guest', …)`
  — and several are comma-separated: `'EX-3, EX-4: …'`. Test files are
  `*.spec.ts`, `*.test.ts`, `*.test.tsx` and `*.testkit.ts`.
- **Only these IDs.** Code, tests and checked-in documents cite a requirement
  by its ID here, never by the item numbers of a design doc under
  `docs/superpowers/specs/`: those are git-ignored, repeat across docs and do
  not resolve in a fresh clone.

## The check

`npm run specs:check` runs `scripts/check-specs.mjs`, plain Node with no
dependencies. It reads:

- **prefixes** from each spec's `Prefix:` line;
- **declarations**: the lines of `docs/specs/*/spec.md` that start
  `**<PREFIX>-<n>**`;
- **references**: every other whole-word `<PREFIX>-<n>` under a declared
  prefix, in every text file git tracks, plus new files it does not ignore —
  except `package-lock.json` and `skills-lock.json`.

It fails, naming the file and line, when:

- a spec has no `Prefix:` line;
- two specs declare the same prefix;
- a spec declares the reserved `EX` prefix;
- an ID is declared twice;
- an ID is declared in a spec whose prefix is not its own;
- a declaration's number starts with `0`;
- a declaration line looks Retired but does not match the exact form;
- a `.md` file sits under `docs/specs/` that is neither `README.md` nor
  `<capability>/spec.md`;
- a reference names an ID no spec declares;
- a reference outside `docs/specs/` names a Retired ID.

It also lists, without failing, every live requirement that no test file
cites. That list is how a requirement with no test shows up.

CI runs the check, and its own tests (`node --test "scripts/*.test.mjs"`), in
the `lint` job. The pre-commit hook does not: it sees only the staged files.
