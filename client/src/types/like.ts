import type * as Shared from 'shared';
import type { Wire } from 'shared';

// No userId: the server takes the liker from the session cookie. `isLike`
// separates a like from a dislike; this UI only ever sends true.
export interface CreateLikePayload {
  bookId?: number;
  commentId?: number;
  isLike: boolean;
}

export type PublicLike = Wire<Shared.PublicLike>;
