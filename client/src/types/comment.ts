import type * as Shared from 'shared';
import type { Wire } from 'shared';

// On a tombstone `userId` is null and `text` is empty: the server keeps the
// original on the row and withholds it in the response, so the client never
// has it to leak.
export type PublicComment = Wire<Shared.PublicComment>;

// What GET /api/comments returns. The author is embedded because /api/users is
// guarded, so the client cannot look one up; it is null on a tombstone of
// either kind, which is what makes it anonymous.
export type CommentWithAuthor = Wire<Shared.CommentWithAuthor>;
