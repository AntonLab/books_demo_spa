# Deleting a comment leaves a tombstone, not a hole

A comment can have replies, and hard-deleting it would either orphan them or force
a recursive delete of the whole subtree. `DELETE /api/comments/:id` instead sets a
`tombstone` (`deleted` by the owner, `removed` by a moderator) on that one row,
blanking its text and author while leaving the row in place so replies keep their
parent and the thread still reads around the gap. The trade-off: a deleted comment
still occupies storage and a database id forever, and every reader of comment data
must treat a tombstoned row as content-free rather than simply absent.
