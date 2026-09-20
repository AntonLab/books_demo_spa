import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { EditChapterPage } from './EditChapterPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
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

const renderPage = (session: PublicUser = account()) => {
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
    { route: '/books/1/chapters/9/edit', queryClient }
  );
};

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
    renderPage();

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
  });

  it('keeps the text when a co-author saved first, and reloads on request', async () => {
    mockedChapters.updateChapter.mockRejectedValue(
      new ApiError(409, 'This chapter was changed since you loaded it')
    );
    renderPage();

    const text = await screen.findByLabelText('Text');
    await userEvent.clear(text);
    await userEvent.type(text, 'My version');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText(
        'This chapter was changed by a co-author — reload'
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toHaveValue('My version');

    mockedChapters.getChapter.mockResolvedValue({
      ...chapter,
      text: 'Their version',
      updatedAt: '2026-09-13T09:00:00.000Z',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Text')).toHaveValue('Their version')
    );
    expect(
      screen.queryByText('This chapter was changed by a co-author — reload')
    ).toBeNull();
  });

  it('deletes the chapter once the deletion is confirmed', async () => {
    mockedChapters.deleteChapter.mockResolvedValue(undefined);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete chapter' })
    );
    expect(mockedChapters.deleteChapter).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    expect(await screen.findByText('Book editor')).toBeInTheDocument();
    expect(mockedChapters.deleteChapter).toHaveBeenCalledWith(9);
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
});
