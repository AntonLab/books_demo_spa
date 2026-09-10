// No userId: the server takes the liker from the session cookie. `isLike`
// separates a like from a dislike; this UI only ever sends true.
export interface CreateLikePayload {
  bookId?: number;
  commentId?: number;
  isLike: boolean;
}

export interface PublicLike {
  id: number;
  userId: number;
  bookId: number | null;
  commentId: number | null;
  isLike: boolean;
  createdAt: string;
}
