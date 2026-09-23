import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { EditChapterPage } from './EditChapterPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import type { RootState } from '@/store';
import type { UnsavedTextEntry } from '@/store/unsavedTextSlice';
import type { BookDetail } from '@/types/book';
import type { PublicChapter } from '@/types/chapter';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/books');
jest.mock('@/api/chapters');

const mockedBooks = jest.mocked(booksApi);
const mockedChapters = jest.mocked(chaptersApi);

const book: BookDetail = {
  id: 1,
  authors: [
    {
      id: 3,
      login: 'ann',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
    {
      id: 4,
      login: 'cora',
      firstName: 'Cora',
      lastName: 'Writer',
      avatarUrl: null,
    },
  ],
  seriesId: null,
  title: 'A Tale of Dragons',
  description: 'Long ago.',
  tags: [],
  status: 'in_progress',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  series: null,
  likeCount: 0,
  viewerLikeId: null,
};

const chapter: PublicChapter = {
  id: 9,
  bookId: 1,
  title: 'Chapter One',
  text: 'It was a dark night.',
  publishedAt: null,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T08:15:30.123Z',
};

const account = (overrides: Partial<PublicUser> = {}): PublicUser => ({
  id: 3,
  login: 'ann',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const renderPage = (
  session: PublicUser = account(),
  preloadedState?: Partial<RootState>
) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(
    <Routes>
      <Route
        path="/books/:bookId/chapters/:chapterId/edit"
        element={<EditChapterPage />}
      />
      <Route path="/books/:id/edit" element={<p>Book editor</p>} />
    </Routes>,
    { route: '/books/1/chapters/9/edit', queryClient, preloadedState }
  );
};

const olderBase = '2026-09-09T00:00:00.000Z';
const typedAgainst = (
  entry: Partial<UnsavedTextEntry> = {}
): Partial<RootState> => ({
  unsavedText: {
    accountId: 3,
    entries: {
      'book:1:chapter:9': {
        title: 'Chapter One',
        text: 'My text',
        baseUpdatedAt: chapter.updatedAt,
        savedAt: '2026-09-23T10:00:00.000Z',
        ...entry,
      },
    },
  },
});
const conflictMessage =
  'A co-author changed this chapter since you started editing.';

beforeEach(() => {
  jest.resetAllMocks();
  mockedBooks.getBook.mockResolvedValue(book);
  mockedChapters.getChapter.mockResolvedValue(chapter);
});

describe('EditChapterPage', () => {
  it('saves against the version it loaded', async () => {
    mockedChapters.updateChapter.mockResolvedValue({
      ...chapter,
      text: 'A darker night.',
      updatedAt: '2026-09-13T09:00:00.000Z',
    });
    const { store } = renderPage();

    const text = await screen.findByLabelText('Text');
    expect(text).toHaveValue('It was a dark night.');
    await userEvent.clear(text);
    await userEvent.type(text, 'A darker night.');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenCalledWith(9, {
        title: 'Chapter One',
        text: 'A darker night.',
        publishedAt: null,
        expectedUpdatedAt: '2026-09-10T08:15:30.123Z',
      })
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('keeps the text on a 409 and swaps in their version on request', async () => {
    mockedChapters.updateChapter.mockRejectedValue(
      new ApiError(409, 'This chapter was changed since you loaded it')
    );
    const { store } = renderPage();

    const text = await screen.findByLabelText('Text');
    await userEvent.clear(text);
    await userEvent.type(text, 'My version');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText(conflictMessage)).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toHaveValue('My version');

    mockedChapters.getChapter.mockResolvedValue({
      ...chapter,
      text: 'Their version',
      updatedAt: '2026-09-13T09:00:00.000Z',
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Use their version' })
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Text')).toHaveValue('Their version')
    );
    expect(screen.queryByText(conflictMessage)).toBeNull();
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('deletes the chapter once the deletion is confirmed', async () => {
    mockedChapters.deleteChapter.mockResolvedValue(undefined);
    const { store } = renderPage(account(), typedAgainst());

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete chapter' })
    );
    expect(mockedChapters.deleteChapter).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    expect(await screen.findByText('Book editor')).toBeInTheDocument();
    expect(mockedChapters.deleteChapter).toHaveBeenCalledWith(9);
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('edits a published chapter without sending a publication time', async () => {
    mockedChapters.getChapter.mockResolvedValue({
      ...chapter,
      publishedAt: '2026-09-11T00:00:00.000Z',
    });
    mockedChapters.updateChapter.mockResolvedValue(chapter);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenCalledWith(9, {
        title: 'Chapter One',
        text: 'It was a dark night.',
        expectedUpdatedAt: '2026-09-10T08:15:30.123Z',
      })
    );
  });

  it('turns away an account that neither co-authors the book nor moderates', async () => {
    renderPage(account({ id: 99, login: 'other' }));

    expect(
      await screen.findByText('Only its co-authors can edit this chapter.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Text')).toBeNull();
  });

  it('reports a chapter that will not load', async () => {
    mockedChapters.getChapter.mockRejectedValue(new ApiError(404, 'Not found'));
    renderPage();

    expect(
      await screen.findByText('Could not load this chapter.')
    ).toBeInTheDocument();
  });

  it('saves against the version the Unsaved text was typed on, not the one reloaded', async () => {
    mockedChapters.updateChapter.mockRejectedValue(
      new ApiError(409, 'This chapter was changed since you loaded it')
    );
    renderPage(account(), typedAgainst({ baseUpdatedAt: olderBase }));

    await screen.findByLabelText('Text');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenCalledWith(9, {
        title: 'Chapter One',
        text: 'My text',
        publishedAt: null,
        expectedUpdatedAt: olderBase,
      })
    );
  });

  it('shows the conflict before any save when a co-author saved since', async () => {
    renderPage(account(), typedAgainst({ baseUpdatedAt: olderBase }));

    expect(await screen.findByText(conflictMessage)).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toHaveValue('My text');
    expect(mockedChapters.updateChapter).not.toHaveBeenCalled();
  });

  it('discards the Unsaved text on Use their version', async () => {
    const { store } = renderPage(
      account(),
      typedAgainst({ baseUpdatedAt: olderBase })
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Use their version' })
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Text')).toHaveValue('It was a dark night.')
    );
    expect(store.getState().unsavedText.entries).toEqual({});
    expect(screen.queryByText(conflictMessage)).toBeNull();
  });

  it('rebases the Unsaved text and keeps it on Keep mine', async () => {
    const { store } = renderPage(
      account(),
      typedAgainst({ baseUpdatedAt: olderBase })
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Keep mine' })
    );

    await waitFor(() =>
      expect(
        store.getState().unsavedText.entries['book:1:chapter:9']?.baseUpdatedAt
      ).toBe(chapter.updatedAt)
    );
    expect(screen.getByLabelText('Text')).toHaveValue('My text');
    expect(screen.queryByText(conflictMessage)).toBeNull();
  });

  it('keeps text typed while a save was in flight, based on that save', async () => {
    const savedUpdatedAt = '2026-09-13T09:00:00.000Z';
    let land: (saved: PublicChapter) => void = () => {};
    mockedChapters.updateChapter.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = resolve;
        })
    );
    const { store } = renderPage();

    const text = await screen.findByLabelText('Text');
    await userEvent.type(text, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenCalled()
    );
    await userEvent.type(text, '?');
    await act(async () =>
      land({
        ...chapter,
        text: 'It was a dark night.!',
        updatedAt: savedUpdatedAt,
      })
    );

    // The refetch still answers the old version, so a base compared with
    // `!==` would flag the Account's own save as a conflict here.
    await waitFor(() =>
      expect(
        store.getState().unsavedText.entries['book:1:chapter:9']?.baseUpdatedAt
      ).toBe(savedUpdatedAt)
    );
    expect(screen.getByLabelText('Text')).toHaveValue('It was a dark night.!?');
    expect(screen.queryByText(conflictMessage)).toBeNull();
  });

  it('clears the entry for a save that lands after the page unmounted', async () => {
    const savedUpdatedAt = '2026-09-13T09:00:00.000Z';
    let land: (saved: PublicChapter) => void = () => {};
    mockedChapters.updateChapter.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = resolve;
        })
    );
    const { store, unmount } = renderPage();

    const text = await screen.findByLabelText('Text');
    await userEvent.type(text, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenCalled()
    );
    unmount();
    // mutateAsync's promise settles whether or not the page that started it
    // is still mounted; mutate's per-call onSuccess would not fire here.
    await act(async () =>
      land({
        ...chapter,
        text: 'It was a dark night.!',
        updatedAt: savedUpdatedAt,
      })
    );

    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('bases text typed right after a save on that save, not the stale chapter', async () => {
    const savedUpdatedAt = '2026-09-13T09:00:00.000Z';
    mockedChapters.updateChapter.mockResolvedValue({
      ...chapter,
      updatedAt: savedUpdatedAt,
    });
    const { store } = renderPage();

    const text = await screen.findByLabelText('Text');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Saved.');
    // getChapter still answers the pre-save version: the refetch lags.
    await userEvent.type(text, '!');

    expect(
      store.getState().unsavedText.entries['book:1:chapter:9']?.baseUpdatedAt
    ).toBe(savedUpdatedAt);
    expect(screen.queryByText(conflictMessage)).toBeNull();
  });

  it('offers the Unsaved text of a chapter that no longer exists', async () => {
    mockedChapters.getChapter.mockRejectedValue(new ApiError(404, 'Not found'));
    renderPage(account(), typedAgainst());

    expect(
      await screen.findByRole('textbox', { name: 'Unsaved text' })
    ).toHaveValue('Chapter One\n\nMy text');
  });
});
