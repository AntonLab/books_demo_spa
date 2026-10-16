import { Op, literal } from 'sequelize';
import type { AccountProfile } from 'shared';
import { Book } from '../models/Book.ts';
import { Comment } from '../models/Comment.ts';
import { Favorite } from '../models/Favorite.ts';
import { Like } from '../models/Like.ts';
import { ReadingListItem } from '../models/ReadingListItem.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import { loadAvatarUrls } from './userRepository.ts';

export interface AccountRepository {
  // null for a missing id and for an Account that is not Active (Blocked or
  // Pending): the page must not confirm such an Account exists.
  findProfile(id: number): Promise<AccountProfile | null>;
}

// Subqueries, not id lists: an id list grows with an Account's works. Each
// binds only the `:id` replacement, never an interpolated value.

// The Published Books the Account co-authors.
const PUBLISHED_BOOK_IDS =
  "(SELECT ba.`bookId` FROM `book_authors` ba JOIN `books` pb ON pb.`id` = ba.`bookId` WHERE ba.`userId` = :id AND pb.`status` <> 'draft')";

// The Account's Series that hold a Published Book (of any author), so a Series
// with only Drafts is dropped.
const COUNTED_SERIES_IDS =
  "(SELECT sa.`seriesId` FROM `series_authors` sa WHERE sa.`userId` = :id AND EXISTS (SELECT 1 FROM `books` sb WHERE sb.`seriesId` = sa.`seriesId` AND sb.`status` <> 'draft'))";

// Every Published Book of those Series, whoever wrote it.
const COUNTED_SERIES_BOOK_IDS = `(SELECT cb.\`id\` FROM \`books\` cb WHERE cb.\`status\` <> 'draft' AND cb.\`seriesId\` IN ${COUNTED_SERIES_IDS})`;

const inIds = (fragment: string) => ({ [Op.in]: literal(fragment) });

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

      const replacements = { id };
      const [
        bookCount,
        seriesCount,
        bookLikes,
        seriesLikes,
        commentsOnBooks,
        favorites,
        booksInReadingLists,
        seriesInReadingLists,
      ] = await Promise.all([
        Book.count({ where: { id: inIds(PUBLISHED_BOOK_IDS) }, replacements }),
        Series.count({
          where: { id: inIds(COUNTED_SERIES_IDS) },
          replacements,
        }),
        Like.count({
          where: { bookId: inIds(PUBLISHED_BOOK_IDS), isLike: true },
          replacements,
        }),
        Like.count({
          where: { bookId: inIds(COUNTED_SERIES_BOOK_IDS), isLike: true },
          replacements,
        }),
        Comment.count({
          where: { bookId: inIds(PUBLISHED_BOOK_IDS), tombstone: null },
          replacements,
        }),
        Favorite.count({
          where: {
            [Op.or]: [
              { bookId: inIds(PUBLISHED_BOOK_IDS) },
              { seriesId: inIds(COUNTED_SERIES_IDS) },
            ],
          },
          replacements,
        }),
        ReadingListItem.count({
          where: { bookId: inIds(PUBLISHED_BOOK_IDS) },
          replacements,
        }),
        ReadingListItem.count({
          where: { seriesId: inIds(COUNTED_SERIES_IDS) },
          replacements,
        }),
      ]);

      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: avatarUrls.get(id) ?? null,
        about: user.about ?? '',
        lastSeenAt: user.showLastSeen ? user.lastSeenAt : null,
        bookCount,
        seriesCount,
        totals: {
          booksInReadingLists,
          seriesInReadingLists,
          bookLikes,
          seriesLikes,
          commentsOnBooks,
          favorites,
        },
      };
    },
  };
}
