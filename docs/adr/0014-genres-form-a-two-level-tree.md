---
status: accepted
date: 2026-10-02
---

# Genres form a two-level tree, names unique among siblings

A Genre may sit beneath one top-level Genre as its Subgenre, and no deeper. A
Genre's name is unique only among its siblings, so "Fantasy / Urban" and
"Mystery / Urban" may both exist, and the UI names a Genre by its path wherever
it shows one alone. This extends ADR-0008: Genres stay a list Admins keep, now
with a parent.

Two levels is what the catalogue needs ("Fantasy", then "Urban Fantasy") and
what an Admin can drag around in one tree without losing track. A deeper tree
would make every filter, breadcrumb and seed question recursive for no reader
benefit. Sibling-scoped names let the same sub-category live under two parents
without inventing artificial names like "Urban (Mystery)".

## Considered Options

- **An arbitrary-depth tree.** Rejected: recursive queries and UI for depth no
  one asked for.
- **Globally unique names**, which the existing index already enforces. Rejected:
  it forces awkward names for a Subgenre that belongs under two parents.
- **Tags as Subgenres.** Rejected for the reason ADR-0008 gives: Tags are
  free-form.

## Consequences

- A Book or a Series may point at a top-level Genre or a Subgenre. Searching by
  a top-level Genre also finds its Subgenres' Books.
- A top-level Genre with Subgenres cannot be deleted; its Subgenres must be
  moved or deleted first. Deleting a Genre still sets its Books' and Series'
  reference to `null`.
- Dragging may move a Subgenre to another parent, promote it to the top level,
  or demote a top-level Genre that has no Subgenres. The server refuses any
  move or rename that would give two siblings the same name.
- Siblings are listed alphabetically; there is no manual order.
- A name shown without its tree around it (a selected filter, a breadcrumb) is
  shown as its full path.
