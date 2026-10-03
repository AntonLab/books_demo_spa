export interface AccountProfileTotals {
  booksInReadingLists: number;
  seriesInReadingLists: number;
  bookLikes: number;
  seriesLikes: number;
  commentsOnBooks: number;
  favorites: number;
}

// The public page's data. No email, login, role or status, by construction.
export interface AccountProfile {
  id: number;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  about: string;
  // null while the Account hides it or has never been seen.
  lastSeenAt: Date | null;
  // Published Books it co-authors, and its Series with a Published Book: the
  // Books and Series tab labels.
  bookCount: number;
  seriesCount: number;
  totals: AccountProfileTotals;
}
