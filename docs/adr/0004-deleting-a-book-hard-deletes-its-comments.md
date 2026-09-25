# Deleting a book hard-deletes its comments, tombstones and all

ADR-0003 keeps a withdrawn comment's row alive so its replies keep a parent, but
that promise stops at the book: `Book.hasMany(Comment)` cascades, so deleting a
book — including the cascade from deleting its author's account — removes every
comment on it outright, other people's threads included. We chose this over
letting a book outlive its owner (a nullable `books.userId`, which would push an
optional owner through the permission checks, both type layers and the client):
`comments.bookId` is `NOT NULL` by design, so a comment whose book is gone has
nowhere to live, and deleting an account is a request to erase that account's
work rather than to leave it standing ownerless.

Amended by ADR-0005: books no longer have a single owner or a `books.userId`
column. The cascade still holds, but deleting an account now deletes only the
works on which it was the last Co-author.
