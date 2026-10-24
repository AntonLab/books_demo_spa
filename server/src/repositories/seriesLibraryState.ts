import { Op } from 'sequelize';
import type { SeriesLibraryState } from 'shared';
import { Book } from '../models/Book.ts';
import { LibraryEntry } from '../models/LibraryEntry.ts';

// The account's Library state over a Series' Published Books (CONTEXT.md).
export async function seriesLibraryStateOf(
  seriesId: number,
  accountId: number
): Promise<SeriesLibraryState> {
  const published = { seriesId, status: { [Op.ne]: 'draft' } };
  const [entries, publishedCount] = await Promise.all([
    LibraryEntry.findAll({
      where: { userId: accountId },
      attributes: ['status'],
      include: [
        {
          model: Book,
          as: 'book',
          attributes: [],
          required: true,
          where: published,
        },
      ],
    }),
    Book.count({ where: published }),
  ]);
  const notInterested = entries.filter(
    (entry) => entry.status === 'not_interested'
  ).length;
  return {
    inLibrary: entries.length > notInterested,
    notInterested: publishedCount > 0 && notInterested === publishedCount,
  };
}
