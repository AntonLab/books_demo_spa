# Covers and Avatars are stored in MySQL, not on disk or in object storage

A Book's Cover and an Account's Avatar are uploaded files, and their bytes live
in MySQL, one row per Book or Account in a table of their own, served through an
API route rather than as static files. We rejected a directory on the server's
disk and S3-compatible object storage. Both leave a file behind whenever the
database cascades a row away — deleting a Book, or an Account and the works it
was the last Co-author of — and neither can join the transaction that writes the
row, so a rolled-back write still leaves its file. Object storage would also add
infrastructure to development, CI and every deployment. In MySQL the foreign
key's cascade removes the picture with its owner in the same transaction, the
twelve per-suite test schemas isolate uploads for free, and a deployment needs
no volume. The cost, a larger database and bytes read through Node, stays small
because the server re-encodes every upload to a fixed size (a Cover of 600×900,
an Avatar of 256×256) before storing it.

## Consequences

- The bytes sit in their own tables, never as a column on `books` or `users`,
  so no list query can drag them along — the same reason `chapters.text` is left
  out of the chapter list.
- Serving goes through the same visibility rules as the Book, so a Draft book's
  Cover is refused by direct link too; `express.static` would bypass them.
- Revisit this if uploads grow beyond small re-encoded pictures — larger
  attachments are what would tip the trade-off towards object storage.
