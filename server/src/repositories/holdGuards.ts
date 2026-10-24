import { Op } from 'sequelize';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { Series } from '../models/Series.ts';
import { SeriesAuthor } from '../models/SeriesAuthor.ts';
import { NotFoundError } from '../types/errors.ts';
import {
  readableBookWhere,
  visibleSeriesWhere,
  type Account,
} from './visibility.ts';

// The checks the Library and the Favorites share before an account holds a Book
// or a Series. A work the account may not see answers exactly as a missing one,
// so a refusal never reveals that a Draft exists.
export async function assertReadableBook(
  bookId: number,
  account: Account
): Promise<void> {
  const book = await Book.findOne({
    where: { [Op.and]: [{ id: bookId }, await readableBookWhere(account)] },
    attributes: ['id'],
  });
  if (!book) throw new NotFoundError('Book', bookId);
}

export async function assertVisibleSeries(
  seriesId: number,
  account: Account
): Promise<void> {
  const series = await Series.findOne({
    where: { [Op.and]: [{ id: seriesId }, await visibleSeriesWhere(account)] },
    attributes: ['id'],
  });
  if (!series) throw new NotFoundError('Series', seriesId);
}

export async function isCoAuthorOfBook(
  bookId: number,
  account: Account
): Promise<boolean> {
  return (
    (await BookAuthor.count({ where: { bookId, userId: account.id } })) > 0
  );
}

export async function isCoAuthorOfSeries(
  seriesId: number,
  account: Account
): Promise<boolean> {
  return (
    (await SeriesAuthor.count({ where: { seriesId, userId: account.id } })) > 0
  );
}
