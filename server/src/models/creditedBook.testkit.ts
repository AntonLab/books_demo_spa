import { Book } from './Book.ts';
import { BookAuthor } from './BookAuthor.ts';
import { Series } from './Series.ts';
import { SeriesAuthor } from './SeriesAuthor.ts';
import type { BookStatus } from '../types/book.ts';

interface BookFixture {
  title: string;
  description: string;
  tags: string[];
  seriesId?: number | null;
  status?: BookStatus;
}

// A book as the MySQL-backed suites need it: stored through the model, with
// its Co-authors credited in the order given. Suites that are not about books
// used to create one with a userId; a book has no owner column now, so this is
// the one place that knows how a book gets its credits.
export async function createCreditedBook(
  fixture: BookFixture,
  coAuthorIds: [number, ...number[]]
): Promise<Book> {
  // Published unless the fixture says otherwise: most suites are not about
  // Draft books, and a draft would hide the very rows they read back.
  // Appended to its series, as bookRepository files a book, so a suite's
  // series lists come back in the order it created them.
  const last =
    fixture.seriesId === undefined || fixture.seriesId === null
      ? null
      : await Book.max<number | null, Book>('seriesPosition', {
          where: { seriesId: fixture.seriesId },
        });
  const book = await Book.create({
    status: 'in_progress',
    ...fixture,
    seriesPosition:
      fixture.seriesId === undefined || fixture.seriesId === null
        ? null
        : (last ?? 0) + 1,
  });
  for (const userId of coAuthorIds) {
    await BookAuthor.create({ bookId: book.id, userId });
  }
  return book;
}

interface SeriesFixture {
  title: string;
  description: string;
  tags: string[];
}

// The same for a series, whose Co-authors live in series_authors.
export async function createCreditedSeries(
  fixture: SeriesFixture,
  coAuthorIds: [number, ...number[]]
): Promise<Series> {
  const series = await Series.create(fixture);
  for (const userId of coAuthorIds) {
    await SeriesAuthor.create({ seriesId: series.id, userId });
  }
  return series;
}
