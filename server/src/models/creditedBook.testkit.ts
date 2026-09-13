import { Book } from './Book.ts';
import { BookAuthor } from './BookAuthor.ts';

interface BookFixture {
  title: string;
  description: string;
  tags: string[];
  seriesId?: number | null;
}

// A book as the MySQL-backed suites need it: stored through the model, with
// its Co-authors credited in the order given. Suites that are not about books
// used to create one with a userId; a book has no owner column now, so this is
// the one place that knows how a book gets its credits.
export async function createCreditedBook(
  fixture: BookFixture,
  coAuthorIds: [number, ...number[]]
): Promise<Book> {
  const book = await Book.create(fixture);
  for (const userId of coAuthorIds) {
    await BookAuthor.create({ bookId: book.id, userId });
  }
  return book;
}
