// The full record. Exactly one of bookId / commentId is non-null.
export interface PublicLike {
  id: number;
  userId: number;
  bookId: number | null;
  commentId: number | null;
  isLike: boolean;
  // No updatedAt: the table keeps createdAt alone.
  createdAt: Date;
}

// The body of POST /api/likes: exactly one target. No userId: the server takes
// the liker from the session. `isLike` separates a like from a dislike.
export interface CreateLikePayload {
  bookId?: number;
  commentId?: number;
  isLike: boolean;
}
