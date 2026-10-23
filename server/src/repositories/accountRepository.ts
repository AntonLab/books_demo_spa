import { QueryTypes } from 'sequelize';
import type { AccountProfile } from 'shared';
import { User } from '../models/User.ts';
import { sequelizeOf } from './sequelizeOf.ts';
import { loadAvatarUrls } from './userRepository.ts';

export interface AccountRepository {
  // null for a missing id and for an Account that is not Active (Blocked or
  // Pending): the page must not confirm such an Account exists.
  findProfile(id: number): Promise<AccountProfile | null>;
}

// No id lists: one would grow with an Account's works. The only runtime value
// is the `:id` replacement.

// Model.count takes no replacements, so the eight totals are scalar subqueries
// of one raw SELECT that binds `:id`. Two CTEs hold the sets the totals share,
// so MySQL materializes each once instead of re-running its join per total.
//   published: the Published Books the Account co-authors.
//   counted_series: the Account's Series that hold a Published Book (of any
//     author), so a Series with only Drafts is dropped.
//   counted_series_books: every Published Book of those Series, whoever wrote it.
const PROFILE_COUNTS = `WITH published AS (
    SELECT ba.bookId FROM book_authors ba
    JOIN books pb ON pb.id = ba.bookId
    WHERE ba.userId = :id AND pb.status <> 'draft'
  ), counted_series AS (
    SELECT sa.seriesId FROM series_authors sa
    WHERE sa.userId = :id
      AND EXISTS (SELECT 1 FROM books sb WHERE sb.seriesId = sa.seriesId AND sb.status <> 'draft')
  ), counted_series_books AS (
    SELECT cb.id AS bookId FROM books cb
    WHERE cb.status <> 'draft' AND cb.seriesId IN (SELECT seriesId FROM counted_series)
  )
SELECT
  (SELECT COUNT(*) FROM books WHERE id IN (SELECT bookId FROM published)) AS bookCount,
  (SELECT COUNT(*) FROM series WHERE id IN (SELECT seriesId FROM counted_series)) AS seriesCount,
  (SELECT COUNT(*) FROM likes WHERE isLike = TRUE AND bookId IN (SELECT bookId FROM published)) AS bookLikes,
  (SELECT COUNT(*) FROM likes WHERE isLike = TRUE AND bookId IN (SELECT bookId FROM counted_series_books)) AS seriesLikes,
  (SELECT COUNT(*) FROM comments WHERE tombstone IS NULL AND bookId IN (SELECT bookId FROM published)) AS commentsOnBooks,
  (SELECT COUNT(*) FROM favorites WHERE bookId IN (SELECT bookId FROM published))
    + (SELECT COUNT(*) FROM favorites WHERE seriesId IN (SELECT seriesId FROM counted_series)) AS favorites,
  (SELECT COUNT(*) FROM reading_list_items WHERE bookId IN (SELECT bookId FROM published)) AS booksInReadingLists,
  (SELECT COUNT(*) FROM reading_list_items WHERE seriesId IN (SELECT seriesId FROM counted_series)) AS seriesInReadingLists`;

// COUNT(*) is a BIGINT, which the driver may hand back as a string.
type ProfileCountKey =
  | 'bookCount'
  | 'seriesCount'
  | 'bookLikes'
  | 'seriesLikes'
  | 'commentsOnBooks'
  | 'favorites'
  | 'booksInReadingLists'
  | 'seriesInReadingLists';
type ProfileCounts = Record<ProfileCountKey, number | string>;

export function createSequelizeAccountRepository(): AccountRepository {
  return {
    async findProfile(id) {
      // Only the columns the page shows: email, login and role are never read,
      // so no later edit can spread them into the answer.
      const user = await User.findByPk(id, {
        attributes: [
          'id',
          'firstName',
          'lastName',
          'status',
          'about',
          'lastSeenAt',
          'showLastSeen',
        ],
      });
      if (!user || user.status !== 'active') return null;

      const avatarUrls = await loadAvatarUrls([id]);
      const [row] = await sequelizeOf(User).query<ProfileCounts>(
        PROFILE_COUNTS,
        {
          replacements: { id },
          type: QueryTypes.SELECT,
        }
      );
      if (!row) throw new Error('Profile counts query returned no row');
      const counts = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, Number(value)])
      ) as Record<ProfileCountKey, number>;

      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: avatarUrls.get(id) ?? null,
        about: user.about ?? '',
        lastSeenAt: user.showLastSeen ? user.lastSeenAt : null,
        bookCount: counts.bookCount,
        seriesCount: counts.seriesCount,
        totals: {
          booksInReadingLists: counts.booksInReadingLists,
          seriesInReadingLists: counts.seriesInReadingLists,
          bookLikes: counts.bookLikes,
          seriesLikes: counts.seriesLikes,
          commentsOnBooks: counts.commentsOnBooks,
          favorites: counts.favorites,
        },
      };
    },
  };
}
