import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router';
import { NewChapterPage } from './NewChapterPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import type { RootState } from '@/store';
import type { BookDetail } from '@/types/book';
import type { PublicChapter } from '@/types/chapter';
import type { PublicUser } from '@/types/api';

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
  commentCount: 0,
  wordCount: 0,
  viewerLikeId: null,
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

const created: PublicChapter = {
  id: 9,
  bookId: 1,
  title: 'Chapter One',
  text: 'It was a dark night.',
  publishedAt: '2026-09-13T00:00:00.000Z',
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
};

const renderPage = (
  session: PublicUser = account(),
  preloadedState?: Partial<RootState>
) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(
    <Routes>
      <Route path="/books/:bookId/chapters/new" element={<NewChapterPage />} />
      <Route path="/books/:id/edit" element={<p>Book editor</p>} />
    </Routes>,
    { route: '/books/1/chapters/new', queryClient, preloadedState }
  );
};

const typedBefore: Partial<RootState> = {
  unsavedText: {
    accountId: 3,
    entries: {
      'book:1:chapterNew': {
        title: 'Draft title',
        text: 'Draft text',
        savedAt: '2026-09-23T10:00:00.000Z',
      },
    },
  },
};

const fill = async () => {
  await userEvent.type(await screen.findByLabelText('Title'), 'Chapter One');
  await userEvent.type(screen.getByLabelText('Text'), 'It was a dark night.');
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedBooks.getBook.mockResolvedValue(book);
});

describe('NewChapterPage', () => {
  it('publishes the new chapter and returns to the book editor', async () => {
    mockedChapters.createChapter.mockResolvedValue(created);
    renderPage();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Book editor')).toBeInTheDocument();
    expect(mockedChapters.createChapter).toHaveBeenCalledWith({
      bookId: 1,
      title: 'Chapter One',
      text: 'It was a dark night.',
      publishedAt: 'now',
    });
  });

  it('still returns to the book editor under StrictMode', async () => {
    mockedChapters.createChapter.mockResolvedValue(created);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.session, account());
    renderWithProviders(
      <Routes>
        <Route
          path="/books/:bookId/chapters/new"
          element={<NewChapterPage />}
        />
        <Route path="/books/:id/edit" element={<p>Book editor</p>} />
      </Routes>,
      { route: '/books/1/chapters/new', queryClient, reactStrictMode: true }
    );

    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Book editor')).toBeInTheDocument();
  });

  it('saves a draft', async () => {
    mockedChapters.createChapter.mockResolvedValue({
      ...created,
      publishedAt: null,
    });
    renderPage();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Book editor')).toBeInTheDocument();
    expect(mockedChapters.createChapter).toHaveBeenCalledWith(
      expect.objectContaining({ publishedAt: null })
    );
  });

  it('shows a refusal and keeps the text', async () => {
    mockedChapters.createChapter.mockRejectedValue(
      new ApiError(400, 'A publication time cannot be in the past')
    );
    renderPage();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(
      await screen.findByText('A publication time cannot be in the past')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toHaveValue('It was a dark night.');
  });

  it('turns away an account that does not co-author the book', async () => {
    renderPage(account({ id: 99, login: 'other' }));

    expect(
      await screen.findByText(
        'Only its co-authors can add chapters to this book.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('restores the title and text typed before', async () => {
    renderPage(account(), typedBefore);

    expect(await screen.findByLabelText('Title')).toHaveValue('Draft title');
    expect(screen.getByLabelText('Text')).toHaveValue('Draft text');
  });

  it('clears the Unsaved text once the chapter is created', async () => {
    mockedChapters.createChapter.mockResolvedValue(created);
    const { store } = renderPage(account(), typedBefore);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Publish' })
    );

    expect(await screen.findByText('Book editor')).toBeInTheDocument();
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('does not force navigation back once the Account has moved elsewhere before the create lands', async () => {
    let land: (chapter: PublicChapter) => void = () => {};
    mockedChapters.createChapter.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = resolve;
        })
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.session, account());

    renderWithProviders(
      <Routes>
        <Route
          path="/books/:bookId/chapters/new"
          element={
            <>
              <NewChapterPage />
              <Link to="/elsewhere">Elsewhere</Link>
            </>
          }
        />
        <Route path="/books/:id/edit" element={<p>Book editor</p>} />
        <Route path="/elsewhere" element={<p>Somewhere else entirely</p>} />
      </Routes>,
      { route: '/books/1/chapters/new', queryClient }
    );

    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(mockedChapters.createChapter).toHaveBeenCalled()
    );

    // The Account left for an unrelated route before the create responded, which
    // unmounts the page; a guard-less navigate would still fire once the
    // promise landed and silently pull them back here.
    await userEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    expect(
      await screen.findByText('Somewhere else entirely')
    ).toBeInTheDocument();

    await act(async () => land(created));

    expect(screen.getByText('Somewhere else entirely')).toBeInTheDocument();
    expect(screen.queryByText('Book editor')).toBeNull();
  });

  it('offers the text to an Account that no longer co-authors the book', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, authors: [] });
    renderPage(account(), typedBefore);

    expect(
      await screen.findByRole('textbox', { name: 'Unsaved text' })
    ).toHaveValue('Draft title\n\nDraft text');
  });
});
