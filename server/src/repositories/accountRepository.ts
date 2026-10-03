import { Op } from 'sequelize';
import type { AccountProfile } from 'shared';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { SeriesAuthor } from '../models/SeriesAuthor.ts';
import { User } from '../models/User.ts';
import { loadAvatarUrls } from './userRepository.ts';

export interface AccountRepository {
  // null for a missing id and for an Account that is not Active (Blocked or
  // Pending): the page must not confirm such an Account exists.
  findProfile(id: number): Promise<AccountProfile | null>;
}

// The Published Books an Account co-authors, and its Series that hold a
// Published Book (of any author), so a Series with only Drafts is dropped.
async function publishedWorks(
  id: number
): Promise<{ bookIds: number[]; seriesIds: number[] }> {
  const credits = await BookAuthor.findAll({
    where: { userId: id },
    attributes: ['bookId'],
    include: [
      {
        model: Book,
        as: 'book',
        attributes: [],
        required: true,
        where: { status: { [Op.ne]: 'draft' } },
      },
    ],
  });

  const seriesCredits = await SeriesAuthor.findAll({
    where: { userId: id },
    attributes: ['seriesId'],
  });
  const withBook = await Book.findAll({
    where: {
      seriesId: seriesCredits.map((credit) => credit.seriesId),
      status: { [Op.ne]: 'draft' },
    },
    attributes: ['seriesId'],
    group: ['seriesId'],
  });
  const seriesWithBook = new Set(withBook.map((book) => book.seriesId));

  return {
    bookIds: credits.map((credit) => credit.bookId),
    seriesIds: seriesCredits
      .map((credit) => credit.seriesId)
      .filter((seriesId) => seriesWithBook.has(seriesId)),
  };
}

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
      const { bookIds, seriesIds } = await publishedWorks(id);

      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: avatarUrls.get(id) ?? null,
        about: user.about ?? '',
        lastSeenAt: user.showLastSeen ? user.lastSeenAt : null,
        bookCount: bookIds.length,
        seriesCount: seriesIds.length,
        totals: {
          booksInReadingLists: 0,
          seriesInReadingLists: 0,
          bookLikes: 0,
          seriesLikes: 0,
          commentsOnBooks: 0,
          favorites: 0,
        },
      };
    },
  };
}
