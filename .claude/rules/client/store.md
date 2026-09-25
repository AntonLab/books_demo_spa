---
paths:
  - 'client/src/store/**'
---

# `src/store/` (ADR-0010)

Redux Toolkit holds only client state that outlives the component showing it
and that the server never sees: Unsaved text and Device preferences
(`CONTEXT.md`). Nothing the server returns goes here.

- **Persistence is ours, not `redux-persist`.** `createAppStore()` reads both
  slices from `localStorage` once, as `preloadedState`; a listener middleware
  writes each back on change, under `books.unsavedText.v1` and
  `books.devicePreferences.v1`. A change that would misread old data (a
  renamed or retyped field) bumps its `v` suffix, so that data is dropped
  instead. An added field with a default does not: the reader fills it in
  (`resultsLayout` reads as `grid`), so nobody loses a stored theme. A stored
  value that fails the shape check is ignored (an array is not an `entries`
  object).
- **Every storage access is in `try/catch`.** Missing storage, a full quota or
  corrupt JSON leave the store working in memory.
- **Unsaved text is written at most once per 500 ms**: the listener
  unsubscribes, waits, writes the state as it is then, and resubscribes. A
  `pagehide` listener writes both slices at once, so a reload inside that
  window loses nothing.
- **Two open tabs sync through the `storage` event**, not just at startup: a
  `window` listener in `index.ts` reparses the other tab's value with
  `persistence.ts`'s own shape guards and replaces the slice here, or resets
  it when the other tab cleared the key. Unsaved text of a different
  signed-in Account is ignored, or the two tabs' `accountChanged` would
  overwrite each other forever. A `replaced` never starts a write of its
  own, or an idle tab could write back a value older than the one its
  sender wrote since. The 500 ms throttle still leaves a
  small race — a keystroke in this tab lands after that reparse and before
  the next write, so a slow-enough interleaving can still lose it.
- **Reducers stay pure**: `upsert` stamps `savedAt` in its `prepare`.
- **An entry is keyed by its place**, always `book:{bookId}:…`
  (`unsavedTextKeys`), so a page whose Book is gone finds all of its entries
  through `entriesOfBook`.
- **Text is kept as typed.** Only an entry equal to its place's `saved` text
  (`''` for a new place, the Comment or Chapter for an edit) leaves the
  state, so opening an edit writes nothing and an edit cleared to `''` stays.
  A whitespace-only entry stays too, or a field whose first keystroke is a
  space or an Enter would snap back to empty. `isBlank` keeps it out of
  storage and out of `entriesOfBook`.
- **A landed Chapter save goes through `saved`, not `remove`.** Text typed
  while the save was in flight survives, rebased onto the version the save
  created.
- **Entries follow the Account, not the session.**
  `useUnsavedTextAccountBinding`, called once in `AppShell`, dispatches
  `accountChanged(id)` when a signed-in id differs from `accountId`: the first
  id is adopted with the entries, a different one discards them. Sign out goes
  through `useSignOut`, which dispatches `discardAll` once the server has
  ended the session (`queries/` never imports the store). A lost session
  (expiry, Block, password reset) dispatches nothing, so the same Account gets
  its text back; until then the text stays readable in that browser's
  `localStorage` (accepted).
- **Read and write entries through the hooks in `useUnsavedText.ts`**:
  `useUnsavedText(key)` for one place, `useOwnUnsavedEntries()` for a view
  over many (with `entriesOfBook`). Never read `state.unsavedText` in a
  component. After a lost session a second Account can sign in before
  `accountChanged` clears the first one's entries, and a form seeded in that
  render would show them; the hooks' private `ownEntries` hides them. A test
  of "no longer a Co-author" drops the Account from the Book, not the
  session's id.
- **Select narrowly.** A selector that builds a new array or object on each
  call re-renders on every dispatch: `useUnsavedText` selects one entry and
  `useOwnUnsavedEntries` selects the map, and components derive from what the
  hooks return instead of selecting themselves.
- The Publication time pickers are not part of an entry: a stale moment could
  publish a Chapter when nobody means it any more.
