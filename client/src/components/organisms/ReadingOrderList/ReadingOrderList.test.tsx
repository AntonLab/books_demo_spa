import { screen, waitFor } from '@testing-library/react';
import { ReadingOrderList } from './ReadingOrderList';
import { renderWithProviders } from '@/test/renderWithProviders';
import { formatDate } from '@/format/date';
import { layOutSortableRows, moveWithKeyboard } from '@/test/sortable';
import { ApiError } from '@/api/client';
import * as chaptersApi from '@/api/chapters';

jest.mock('@/api/chapters');

const mockedChapters = jest.mocked(chaptersApi);

const chapterNamed = (
  id: number,
  title: string,
  publishedAt: string | null
) => ({
  id,
  bookId: 1,
  title,
  publishedAt,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const page = (items: ReturnType<typeof chapterNamed>[]) => ({
  items,
  total: items.length,
  limit: 100,
  offset: 0,
});

const OUT = '2026-09-02T00:00:00.000Z';
const one = chapterNamed(1, 'One', OUT);
const two = chapterNamed(2, 'Two', OUT);
const three = chapterNamed(3, 'Three', OUT);

const titlesOnScreen = () =>
  screen
    .getAllByRole('link')
    .map((link) => link.textContent)
    .filter((text) => ['One', 'Two', 'Three', 'Four'].includes(text ?? ''));

const renderList = (isCoAuthor = true) =>
  renderWithProviders(<ReadingOrderList bookId={1} isCoAuthor={isCoAuthor} />);

beforeEach(() => {
  jest.resetAllMocks();
  mockedChapters.listChapters.mockResolvedValue(page([]));
});

describe('ReadingOrderList', () => {
  it('lists every chapter with its state, linked to its editor', async () => {
    mockedChapters.listChapters.mockResolvedValue(
      page([
        chapterNamed(9, 'Out', OUT),
        chapterNamed(10, 'Unwritten', null),
        chapterNamed(
          11,
          'Coming',
          new Date(Date.now() + 86_400_000).toISOString()
        ),
      ])
    );
    renderList();

    expect(
      await screen.findByRole('link', { name: 'Unwritten' })
    ).toHaveAttribute('href', '/books/1/chapters/10/edit');
    expect(
      screen.getByText('Draft', { selector: '.ant-tag' })
    ).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText(formatDate(OUT))).toBeInTheDocument();
  });

  it('offers Add chapter to a co-author and to nobody else', async () => {
    const { unmount } = renderList();

    expect(
      await screen.findByRole('link', { name: 'Add chapter' })
    ).toHaveAttribute('href', '/books/1/chapters/new');

    unmount();
    renderList(false);

    expect(await screen.findByText('Chapters')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add chapter' })).toBeNull();
  });

  describe('Reading order', () => {
    let restoreLayout: () => void;
    beforeEach(() => {
      restoreLayout = layOutSortableRows();
    });
    afterEach(() => restoreLayout());

    it('shows the new order at once and saves it on drop', async () => {
      let finishSave: () => void = () => {};
      mockedChapters.reorderChapters.mockReturnValue(
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
      );
      mockedChapters.listChapters
        .mockResolvedValueOnce(page([one, two, three]))
        .mockResolvedValue(page([two, one, three]));
      renderList();

      await moveWithKeyboard(
        await screen.findByRole('button', { name: 'Reorder One' }),
        'ArrowDown'
      );

      expect(mockedChapters.reorderChapters).toHaveBeenCalledWith(1, [2, 1, 3]);
      expect(titlesOnScreen()).toEqual(['Two', 'One', 'Three']);

      finishSave();
      await waitFor(() =>
        expect(mockedChapters.listChapters).toHaveBeenCalledTimes(2)
      );
      expect(titlesOnScreen()).toEqual(['Two', 'One', 'Three']);
    });

    it('puts the old order back and says so when the save fails', async () => {
      let failSave: (error: Error) => void = () => {};
      mockedChapters.reorderChapters.mockReturnValue(
        new Promise<void>((_resolve, reject) => {
          failSave = reject;
        })
      );
      // The list the server would still answer with, so the refetch after the
      // failure cannot be what restores the order.
      mockedChapters.listChapters
        .mockResolvedValueOnce(page([one, two, three]))
        .mockReturnValue(new Promise(() => {}));
      renderList();

      await moveWithKeyboard(
        await screen.findByRole('button', { name: 'Reorder One' }),
        'ArrowDown'
      );
      expect(titlesOnScreen()).toEqual(['Two', 'One', 'Three']);

      failSave(new ApiError(500, 'Internal Server Error'));

      expect(
        await screen.findByText('Could not save the new chapter order.')
      ).toBeInTheDocument();
      expect(titlesOnScreen()).toEqual(['One', 'Two', 'Three']);
    });

    it('on a conflict reloads the chapters and says why the order changed', async () => {
      mockedChapters.reorderChapters.mockRejectedValue(
        new ApiError(
          409,
          'The chapters of this book changed since you loaded them'
        )
      );
      mockedChapters.listChapters
        .mockResolvedValueOnce(page([one, two, three]))
        .mockResolvedValue(
          page([one, two, three, chapterNamed(4, 'Four', OUT)])
        );
      renderList();

      await moveWithKeyboard(
        await screen.findByRole('button', { name: 'Reorder Three' }),
        'ArrowUp'
      );

      expect(
        await screen.findByText(
          'A co-author changed the chapters while you were reordering them. This is their current order.'
        )
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(titlesOnScreen()).toEqual(['One', 'Two', 'Three', 'Four'])
      );
    });
  });
});
