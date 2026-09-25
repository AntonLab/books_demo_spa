import type * as Shared from 'shared';
import type { Wire } from 'shared';

// The shared shapes are the server's, with `Date` fields. Wire<> turns those
// into the ISO strings they cross the wire as: using the server type directly
// would typecheck and then throw on `.getFullYear()`.
export type PublicUser = Wire<Shared.PublicUser>;

// The email-free author shape the public endpoints embed. The omission is what
// makes it safe to return without a session — the email is the whole reason
// /api/users is guarded, so the client can never look an author up itself.
export type AuthorSummary = Wire<Shared.AuthorSummary>;

// Like a book, a series has no userId: its Co-authors come embedded, in credit
// order.
export type PublicSeries = Wire<Shared.PublicSeries>;

// One book of the series editor's list. A summary, because the list reaches a
// series' Co-authors who may not co-author a Draft book filed in it: what the
// book is called and where it stands, never what it says.
export type SeriesBookSummary = Wire<Shared.SeriesBookSummary>;

// On a tombstone `userId` is null and `text` is empty: the server keeps the
// original on the row and withholds it in the response, so the client never
// has it to leak.
export type PublicComment = Wire<Shared.PublicComment>;

// What GET /api/comments returns. The author is embedded because /api/users is
// guarded, so the client cannot look one up; it is null on a tombstone of
// either kind, which is what makes it anonymous.
export type CommentWithAuthor = Wire<Shared.CommentWithAuthor>;

// A snapshot of who changed the credits on a shared work, taken when it
// happened. `work.id` is null once the work is gone: name it, but do not link
// to it. `actor.name` is set for a Co-author only; a Moderator and a deleted
// account are never named.
export type PublicNotification = Wire<Shared.PublicNotification>;

export type NotificationList = Wire<Shared.NotificationList>;

export type PublicLike = Wire<Shared.PublicLike>;

// No userId: the server takes the liker from the session cookie. `isLike`
// separates a like from a dislike; this UI only ever sends true.
export interface CreateLikePayload {
  bookId?: number;
  commentId?: number;
  isLike: boolean;
}
