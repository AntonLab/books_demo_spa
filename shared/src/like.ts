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
