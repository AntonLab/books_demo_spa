---
paths:
  - 'client/src/components/organisms/ChapterEditorModal/**'
---

# Chapter editor modal

- `ChapterEditorModal` is layout and button wiring; its rules live in
  `useChapterEdit` beside it and are tested there. It saves against the
  Unsaved text's `baseUpdatedAt`, the version the typing started from, and
  against the loaded `updatedAt` only when nothing was typed; otherwise a
  reload would refetch a Co-author's save and overwrite it with no 409. After
  a save, the version comes from its response, since `chapter.data` lags until
  the refetch; a landed save dispatches `saved`, which keeps text typed during
  it. A loaded version newer than the base (compared as ISO strings), or a
  409, is the conflict: `takeTheirs` discards the entry and refetches;
  `keepMine` refetches and rebases the entry, so the next Save is a deliberate
  overwrite. `formKey` is `updatedAt` plus a reset counter, and the form seeds
  from the entry. Each edit passes the newest known version as `saved`, so
  text changed back to it leaves no entry. `save` and `remove` go through
  `mutateAsync(...).then(...)`, not a per-call `mutate` callback, since
  TanStack skips that callback once the modal has unmounted. The `mountedRef`
  guards stay.
- `onSaved` runs after the `saved` dispatch and never on a 409.
- A mask click, Escape or the close icon closes only the Chapter modal,
  silently, and keeps its Unsaved text. It has no `usePageGuard` and no
  `DiscardGuardModal`.
- Escape and the close icon reach only the top modal, because it is a sibling
  of the Book modal's `DiscardGuardModal`, not a child of it.
- A place that is gone (404) or no longer editable shows `UnsavedTextNotice`
  in the modal; only Discard removes the text.
