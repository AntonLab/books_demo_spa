import { QueryTypes } from 'sequelize';
import type { AccountProfile } from 'shared';
import { User } from '../models/User.ts';
import { loadAvatarUrls } from './userRepository.ts';

export interface AccountRepository {
  // null for a missing id and for an Account that is not Active (Blocked or
  // Pending): the page must not confirm such an Account exists.
  findProfile(id: number): Promise<AccountProfile | null>;
}

// Subqueries, not id lists: an id list grows with an Account's works. The only
// runtime value is the `:id` replacement.

// The Published Books the Account co-authors.
const PUBLISHED_BOOK_IDS =
  "(SELECT ba.`bookId` FROM `book_authors` ba JOIN `books` pb ON pb.`id` = ba.`bookId` WHERE ba.`userId` = :id AND pb.`status` <> 'draft')";

// The Account's Series that hold a Published Book (of any author), so a Series
// with only Drafts is dropped.
const COUNTED_SERIES_IDS =
  "(SELECT sa.`seriesId` FROM `series_authors` sa WHERE sa.`userId` = :id AND EXISTS (SELECT 1 FROM `books` sb WHERE sb.`seriesId` = sa.`seriesId` AND sb.`status` <> 'draft'))";

// Every Published Book of those Series, whoever wrote it.
const COUNTED_SERIES_BOOK_IDS =
  "(SELECT cb.`id` FROM `books` cb WHERE cb.`status` <> 'draft' AND cb.`seriesId` IN " +
  COUNTED_SERIES_IDS +
  ')';

// Model.count takes no replacements, so the eight totals are scalar
// subqueries of one raw SELECT that binds `:id`.
const PROFILE_COUNTS = `SELECT
  (SELECT COUNT(*) FROM \`books\` WHERE \`id\` IN ${PUBLISHED_BOOK_IDS}) AS bookCount,
  (SELECT COUNT(*) FROM \`series\` WHERE \`id\` IN ${COUNTED_SERIES_IDS}) AS seriesCount,
  (SELECT COUNT(*) FROM \`likes\` WHERE \`isLike\` = TRUE AND \`bookId\` IN ${PUBLISHED_BOOK_IDS}) AS bookLikes,
  (SELECT COUNT(*) FROM \`likes\` WHERE \`isLike\` = TRUE AND \`bookId\` IN ${COUNTED_SERIES_BOOK_IDS}) AS seriesLikes,
  (SELECT COUNT(*) FROM \`comments\` WHERE \`tombstone\` IS NULL AND \`bookId\` IN ${PUBLISHED_BOOK_IDS}) AS commentsOnBooks,
  (SELECT COUNT(*) FROM \`favorites\` WHERE \`bookId\` IN ${PUBLISHED_BOOK_IDS} OR \`seriesId\` IN ${COUNTED_SERIES_IDS}) AS favorites,
  (SELECT COUNT(*) FROM \`reading_list_items\` WHERE \`bookId\` IN ${PUBLISHED_BOOK_IDS}) AS booksInReadingLists,
  (SELECT COUNT(*) FROM \`reading_list_items\` WHERE \`seriesId\` IN ${COUNTED_SERIES_IDS}) AS seriesInReadingLists`;

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
      const sequelize = User.sequelize;
      if (!sequelize) throw new Error('User model is not initialised');
      const [row] = await sequelize.query<ProfileCounts>(PROFILE_COUNTS, {
        replacements: { id },
        type: QueryTypes.SELECT,
      });
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
