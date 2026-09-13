# Response types live in a source-only `shared` workspace

The client used to keep hand-copied versions of the server's response types and
string unions, and nothing failed when the two drifted apart. They now live in
a third npm workspace, `shared`, consumed as TypeScript source with no build
step: its `exports` point at `src/index.ts`, which the client's webpack and
Jest transpile like their own code and the server's Node loads by stripping
types. It holds what the API returns, written in the server's shape (dates as
`Date`), and the `as const` arrays behind the string unions both packages use,
with each union derived from its array. The client reads every shape through
`Wire<T>`, which turns each `Date` into the ISO string it arrives as, so no
copy with string dates is left to drift. `client/src/types` and
`server/src/types` stay the modules each package imports, re-exporting from
`shared`. zod stays out of it: the server's schemas build their enums from the
shared arrays, but no schema is shared, so zod never enters the client bundle.

## Considered Options

- **Keep the hand-mirrored copies.** No tooling, but a drift fails nowhere, not
  even as a type error, and every union has to be edited twice.
- **Share the zod schemas** and infer both sides' types from them. That puts
  zod in the client bundle for types it only reads, and the request schemas
  describe what the server _accepts_ (coercions, defaults, `.transform`s)
  rather than what it returns.
- **A compiled package** with its own build and TypeScript project references.
  It runs anywhere a plain JavaScript dependency does, but every consumer would
  depend on a build step running first — in `dev`, `test`, `typecheck` and CI.
  The repo has none today, and both consumers can read the source directly.
- **Types only, as `.d.ts` files.** Nothing to execute, but a declaration file
  cannot hold the runtime `as const` arrays the zod enums and Sequelize ENUMs
  are built from, so the unions would still be written twice.

## Consequences

- The server's `dist/` still imports `shared` as `.ts` at runtime. Node strips
  types from it only because npm links the workspace, so the file's real path
  is outside `node_modules`. If the package is copied into `node_modules`
  instead, Node refuses it with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
  A deployment must therefore keep the workspace link and run a Node that
  strips types (>= 22.18); an image that prunes or flattens `node_modules`
  needs a build step for `shared` first.
- `shared` follows Node's rules even though the client is bundled: relative
  imports carry `.ts`, and only erasable syntax is allowed (no `enum` or
  `namespace`, and type-only imports marked `type`). The client's `tsconfig`
  allows `.ts` import extensions for that reason, and its swc-loader
  `include` names the shared source.
- `shared` has no `build` or `test` script, so the root fan-outs of both run
  with `--if-present`. `Wire<T>` is pinned by type-level assertions in
  `wire.typetest.ts`, which `npm run typecheck` checks.
- Only the response shapes are shared. The client's request payloads are still
  written by hand beside its API calls, and what the server's controllers wrap
  around a result (the list envelope's `limit` and `offset`) is not
  type-checked against the shared `ListResponse`.
