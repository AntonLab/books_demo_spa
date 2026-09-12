# `comments.parentId` uses `ON DELETE SET NULL`, not `CASCADE`

A reply's `parentId` looks like an obvious `CASCADE` candidate — delete a comment,
lose its subtree — but it is a self-referential foreign key, and InnoDB caps a
cascade chain at 15 levels. Measured on MySQL 8.0.46: with `CASCADE`, deleting a
thread nested past 15 levels fails with `ER_FK_DEPTH_EXCEEDED` (errno 3008), and so
does deleting the book that owns it, because `books` → `comments` then recurses
through the replies; `RESTRICT` fails that same book delete with errno 1451.
`SET NULL` is the only option under which both operations still succeed, at the
cost of promoting a deleted comment's direct replies to top-level threads.
