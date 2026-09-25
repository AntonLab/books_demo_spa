import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useParams } from 'react-router';
import { NewBookPage } from './NewBookPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { PublicBook } from '@/types/book';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/books');
jest.mock('@/api/genres');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedGenres = jest.mocked(genresApi);
const mockedSeries = jest.mocked(seriesApi);

const author: PublicUser = {
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
};

const created: PublicBook = {
  id: 42,
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
  status: 'draft',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// Stands in for the edit route, so a test can see where creating a book leads.
const EditTarget = () => <p>Editing book {useParams().id}</p>;

const renderPage = (session: PublicUser | null = author) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(
    <Routes>
      <Route path="/books/new" element={<NewBookPage />} />
      <Route path="/books/:id/edit" element={<EditTarget />} />
    </Routes>,
    { route: '/books/new', queryClient }
  );
};

const fillAndSubmit = async () => {
  await userEvent.type(screen.getByLabelText('Title'), 'A Tale of Dragons');
  await userEvent.type(screen.getByLabelText('Description'), 'Long ago.');
  await userEvent.click(screen.getByRole('button', { name: 'Create book' }));
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedSeries.listSeries.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
  mockedGenres.listGenres.mockResolvedValue({
    items: [{ id: 4, name: 'Gothic' }],
  });
});

describe('NewBookPage', () => {
  it('creates the book and opens it for editing, where its co-authors are managed', async () => {
    mockedBooks.createBook.mockResolvedValue(created);
    renderPage();

    await fillAndSubmit();

    expect(mockedBooks.createBook).toHaveBeenCalledWith({
      title: 'A Tale of Dragons',
      description: 'Long ago.',
      tags: [],
      seriesId: null,
      genreId: null,
    });
    expect(await screen.findByText('Editing book 42')).toBeInTheDocument();
  });

  it('offers the series the author co-authors', async () => {
    renderPage();

    await waitFor(() =>
      expect(mockedSeries.listSeries).toHaveBeenCalledWith({
        userId: author.id,
        limit: 100,
      })
    );
  });

  it('shows a refusal and keeps what was typed', async () => {
    mockedBooks.createBook.mockRejectedValue(
      new ApiError(403, 'You may only add books to series you co-author')
    );
    renderPage();

    await fillAndSubmit();

    expect(
      await screen.findByText('You may only add books to series you co-author')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('A Tale of Dragons');
  });

  it('explains itself to an account that is not an author', () => {
    renderPage({ ...author, role: 'user' });

    expect(
      screen.getByText(
        'Only an account holding the author role can create books.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('offers the genres the server keeps', async () => {
    renderPage();

    // "No genre" is the select's own first option and its value on a new book.
    expect(await screen.findByText('No genre')).toBeInTheDocument();
    await waitFor(() =>
      expect(mockedGenres.listGenres).toHaveBeenCalledTimes(1)
    );
  });
});
