import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingOrderList } from './ReadingOrderList';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { editorAccount } from '@/test/editFixtures';
import { queryKeys } from '@/queries/keys';
import type { RootState } from '@/store';
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

const onAdd = jest.fn();
const onEdit = jest.fn();

const titlesOnScreen = () =>
  screen.getAllByText(/^(One|Two|Three|Four)$/).map((node) => node.textContent);

const entry = (extra = {}) => ({
  title: 'Draft',
  text: 'Words',
  savedAt: '2026-09-23T10:00:00.000Z',
  ...extra,
});
const withEntries = (
  entries: Record<string, ReturnType<typeof entry>>
): Partial<RootState> => ({
  unsavedText: { accountId: 3, entries },
});

const renderList = (isCoAuthor = true, preloadedState?: Partial<RootState>) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, editorAccount());
  return renderWithProviders(
    <ReadingOrderList
      bookId={1}
      isCoAuthor={isCoAuthor}
      onAdd={onAdd}
      onEdit={onEdit}
    />,
    { queryClient, preloadedState }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedChapters.listChapters.mockResolvedValue(page([]));
});

describe('ReadingOrderList', () => {
  it('lists every chapter with its state and date', async () => {
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
      await screen.findByText('Draft', { selector: '.ant-tag' })
    ).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText(formatDate(OUT))).toBeInTheDocument();
  });

  it('opens the Chapter editor from a row Edit button', async () => {
    mockedChapters.listChapters.mockResolvedValue(
      page([chapterNamed(10, 'Unwritten', null)])
    );
    renderList();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit Unwritten' })
    );

    expect(onEdit).toHaveBeenCalledWith(10);
  });

  it('offers Add chapter to a co-author and to nobody else', async () => {
    const { unmount } = renderList();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add chapter' })
    );
    expect(onAdd).toHaveBeenCalledTimes(1);

    unmount();
    renderList(false);

    expect(await screen.findByText('No chapters yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add chapter' })).toBeNull();
  });

  it('marks a row and Add chapter that hold Unsaved text, and not a row with only whitespace', async () => {
    mockedChapters.listChapters.mockResolvedValue(page([one, two]));
    renderList(
      true,
      withEntries({
        'book:1:chapter:1': entry(),
        'book:1:chapter:2': entry({ title: ' ', text: '  ' }),
        'book:1:chapterNew': entry(),
      })
    );

    // The rows load after Add chapter's own marker is already there.
    await screen.findByText('Two');
    expect(screen.getAllByText('Unsaved changes')).toHaveLength(2);
    expect(
      within(screen.getByText('One').closest('li') as HTMLElement).getByText(
        'Unsaved changes'
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByText('Two').closest('li') as HTMLElement).queryByText(
        'Unsaved changes'
      )
    ).toBeNull();
  });

  it('deletes a chapter once confirmed and drops its Unsaved text', async () => {
    mockedChapters.listChapters.mockResolvedValue(
      page([chapterNamed(10, 'Unwritten', null)])
    );
    mockedChapters.deleteChapter.mockResolvedValue(undefined);
    const { store } = renderList(
      true,
      withEntries({ 'book:1:chapter:10': entry() })
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete Unwritten' })
    );
    expect(mockedChapters.deleteChapter).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );
    await waitFor(() =>
      expect(mockedChapters.deleteChapter).toHaveBeenCalledWith(10)
    );
    await waitFor(() =>
      expect(store.getState().unsavedText.entries).toEqual({})
    );
  });

  it('shows the server message and keeps the Unsaved text when a delete fails', async () => {
    mockedChapters.listChapters.mockResolvedValue(
      page([chapterNamed(10, 'Unwritten', null)])
    );
    mockedChapters.deleteChapter.mockRejectedValue(
      new Error('Chapter is locked')
    );
    const { store } = renderList(
      true,
      withEntries({ 'book:1:chapter:10': entry() })
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete Unwritten' })
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );
    expect(await screen.findByText('Chapter is locked')).toBeInTheDocument();
    expect(Object.keys(store.getState().unsavedText.entries)).toEqual([
      'book:1:chapter:10',
    ]);
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
