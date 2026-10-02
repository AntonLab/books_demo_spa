import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingListItemsList } from './ReadingListItemsList';
import { renderWithProviders } from '@/test/renderWithProviders';
import { layOutSortableRows, moveWithKeyboard } from '@/test/sortable';
import { ApiError } from '@/api/client';
import * as readingListsApi from '@/api/readingLists';
import type { PublicSeries } from '@/types/api';
import type { PublicBook } from '@/types/book';
import type { ReadingListEditItem } from '@/types/readingList';

jest.mock('@/api/readingLists');

const mocked = jest.mocked(readingListsApi);

const ann = {
  id: 3,
  login: 'ann',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};

const bookItem = (id: number, title: string): ReadingListEditItem => ({
  id,
  kind: 'book',
  book: {
    id: 1,
    title,
    status: 'complete',
    authors: [ann],
    description: 'D.',
    tags: [],
    genre: null,
    coverUrl: null,
    seriesId: null,
    series: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as PublicBook,
});

const seriesItem = (id: number, title: string): ReadingListEditItem => ({
  id,
  kind: 'series',
  series: {
    id: 12,
    title,
    coverUrl: null,
    bookCount: 1,
    authors: [ann],
    description: 'D.',
    tags: [],
    genre: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as PublicSeries,
});

const hidden = (id: number): ReadingListEditItem => ({
  id,
  kind: 'unavailable',
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ReadingListItemsList', () => {
  it('lists each item by its title, a Book or a Series, and names a hidden one without a title', async () => {
    mocked.listReadingListItems.mockResolvedValue({
      items: [
        bookItem(1, 'A Tale of Dragons'),
        seriesItem(2, 'The Ashgrove Chronicles'),
        hidden(3),
      ],
    });
    renderWithProviders(<ReadingListItemsList listId={4} mayEdit />);
    expect(
      await screen.findByRole('link', { name: 'A Tale of Dragons' })
    ).toHaveAttribute('href', '/books/1');
    expect(
      screen.getByRole('link', { name: 'The Ashgrove Chronicles' })
    ).toHaveAttribute('href', '/series/12');
    expect(screen.getByText('Unavailable item')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(3);
  });

  it('asks for no items until the viewer is known to own the list', () => {
    renderWithProviders(<ReadingListItemsList listId={4} mayEdit={false} />);
    expect(mocked.listReadingListItems).not.toHaveBeenCalled();
  });

  it('removes an item at once, a hidden one included', async () => {
    mocked.listReadingListItems.mockResolvedValue({
      items: [bookItem(1, 'One'), hidden(3)],
    });
    mocked.removeReadingListItem.mockResolvedValue(undefined);
    renderWithProviders(<ReadingListItemsList listId={4} mayEdit />);
    const removes = await screen.findAllByRole('button', { name: 'Remove' });
    await userEvent.click(removes[1]!);
    await waitFor(() =>
      expect(mocked.removeReadingListItem).toHaveBeenCalledWith(4, 3)
    );
  });

  it('saves a new order by item id, hidden rows included', async () => {
    const restoreLayout = layOutSortableRows();
    try {
      mocked.listReadingListItems.mockResolvedValue({
        items: [bookItem(1, 'One'), hidden(2), bookItem(3, 'Three')],
      });
      mocked.reorderReadingListItems.mockResolvedValue(undefined);
      renderWithProviders(<ReadingListItemsList listId={4} mayEdit />);
      await moveWithKeyboard(
        await screen.findByRole('button', { name: 'Reorder One' }),
        'ArrowDown'
      );
      expect(mocked.reorderReadingListItems).toHaveBeenCalledWith(4, [2, 1, 3]);
    } finally {
      restoreLayout();
    }
  });

  it('on a 409 says the list changed and shows the current order', async () => {
    const restoreLayout = layOutSortableRows();
    try {
      mocked.listReadingListItems.mockResolvedValue({
        items: [bookItem(1, 'One'), bookItem(3, 'Three')],
      });
      mocked.reorderReadingListItems.mockRejectedValue(
        new ApiError(
          409,
          'The items of this reading list changed since you loaded them'
        )
      );
      renderWithProviders(<ReadingListItemsList listId={4} mayEdit />);
      await moveWithKeyboard(
        await screen.findByRole('button', { name: 'Reorder One' }),
        'ArrowDown'
      );
      expect(
        await screen.findByText(
          'The items of this reading list changed while you were reordering them. This is their current order.'
        )
      ).toBeInTheDocument();
    } finally {
      restoreLayout();
    }
  });

  it('shows the empty text for a list with no items', async () => {
    mocked.listReadingListItems.mockResolvedValue({ items: [] });
    renderWithProviders(<ReadingListItemsList listId={4} mayEdit />);
    expect(
      await screen.findByText(
        'No items yet. Add a Book or Series from its page.'
      )
    ).toBeInTheDocument();
  });
});
