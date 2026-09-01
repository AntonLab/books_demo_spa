# Client — books_demo_spa

React 19 + TypeScript single-page app, laid out in the Create React App (CRA) style.

## Status

Early scaffold. `package.json` declares `react` / `react-dom` plus dev tooling for
TypeScript, ESLint, and Prettier. There is still **no bundler, dev server, or test
runner** (the CRA `react-scripts` setup and `public/` were removed), so `dev`,
`build`, and `test` do **not** exist — do not document or invoke them until a
bundler/test runner is added.

Available scripts:

- `npm run typecheck` — `tsc --noEmit` (type-check only; there is no build/emit)
- `npm run lint` / `npm run lint:fix` — ESLint 9 flat config (`eslint.config.mjs`)
- `npm run format` / `npm run format:check` — Prettier (root `.prettierrc.json`)

## Layout

- `src/index.tsx` — app entry, mounts `<App />` into `#root`
- `src/App.tsx` — root component (default export)
- `src/api/` — API client and typed requests _(empty — to be created)_
- `src/components/` — reusable UI components _(empty)_
- `src/pages/` — page-level components _(empty)_
- `src/store/` — client state _(empty)_
- `src/types/` — shared TypeScript types _(empty)_
- `tsconfig.json` — strict, `noEmit`, `jsx: react-jsx`,
  `moduleResolution: Bundler`, target `ES2020`
- `eslint.config.mjs` — ESLint flat config (TypeScript + React + hooks + jsx-a11y)

## TypeScript

- Strict mode is enabled (`tsconfig.json`). Avoid `any`; prefer `unknown` or a
  proper type, and add a comment if `any` is truly unavoidable.
  `@typescript-eslint/no-explicit-any` is enforced as an error.
- `tsconfig` is `noEmit` — type-checking only; a bundler (once added) produces the build.

## Conventions

- Functional components with hooks only — no class components.
- When a test runner is added, co-locate tests next to the component
  (`Button.tsx` → `Button.test.tsx`). No test runner is configured yet.
- Do not mutate state directly — use setter functions or immutable updates.

Note: the entry files use default exports (`export default App`). Pick an export
convention when real components are added and apply it consistently.
