---
status: accepted
date: 2026-09-19
---

# Genres are a list Admins keep, not a fixed list in code

A Genre is a row in a table of its own that Admins and Superadmins add to,
rename and delete through the API and a management page, and a Book or a Series
points at one or at none.

Genres are editorial, not structural: adding "Horror" or
renaming "Hard SF" should not take a code change and a deploy, whereas a new
Book status changes what the server enforces.

## Considered Options

- **A closed `as const` list in `shared`**, like Book statuses and Roles, which
  is what a reader would expect. Rejected for the reason above.
- **A curated subset of Tags.** Tags are free-form: a Book tagged `Gothic`
  rather than `gothic` would silently fall out of its Genre.

## Consequences

- Genres are a resource in the role-permission matrix: Admin and Superadmin
  hold `any` on writing them, every other Role `none`, and everyone, Guests
  included, may read them.
- A Genre is optional on both a Book and a Series, so deleting one sets their
  reference to `null` rather than being refused or cascading. The Co-authors
  are not notified: a Notification covers changes to who is credited on a work
  and its deletion, not edits to the catalogue around it.
- A Series' Genre is its own, set independently of its Books'. Nothing is
  inherited in either direction.
