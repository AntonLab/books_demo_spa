import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { MyBooksPage } from './MyBooksPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as booksApi from '@/api/books';
import type { PublicBook } from '@/types/book';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/books');

const mockedBooks = jest.mocked(booksApi);

const author: PublicUser = {
  id: 3,
  login: 'ann',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const book = (id: number, title: string, status: PublicBook['status']) => ({
  id,
  authors: [{ id: 3, login: 'ann', firstName: 'Ann', lastName: 'Author' }],
  seriesId: null,
  title,
  description: `${title}, described`,
  tags: [],
  status,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const renderPage = (session: PublicUser | null = author) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(
    <Routes>
      <Route path="/my-books" element={<MyBooksPage />} />
      <Route path="/books/new" element={<p>New book form</p>} />
    </Routes>,
    { route: '/my-books', queryClient }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedBooks.listBooks.mockResolvedValue({
    items: [book(1, 'Private Draft', 'draft'), book(2, 'Out Now', 'complete')],
    total: 2,
    limit: 100,
    offset: 0,
  });
});

describe('MyBooksPage', () => {
  it("lists the author's own books, drafts included, with their status", async () => {
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Private Draft' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Out Now' })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // Naming the caller's own id is what makes the server include drafts.
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      userId: author.id,
      limit: 100,
    });
  });

  it('keeps the books under a Books tab', async () => {
    renderPage();

    expect(
      await screen.findByRole('tab', { name: 'Books' })
    ).toBeInTheDocument();
  });

  it('opens the new book form', async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Create book' })
    );

    expect(await screen.findByText('New book form')).toBeInTheDocument();
  });

  it('says so when the author has no books yet', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
    renderPage();

    expect(
      await screen.findByText('You have not written a book yet.')
    ).toBeInTheDocument();
  });

  it('explains itself to an account that is not an author, and asks for nothing', async () => {
    renderPage({ ...author, role: 'user' });

    expect(
      screen.getByText(
        'Books are kept here for accounts holding the author role.'
      )
    ).toBeInTheDocument();
    await waitFor(() => expect(mockedBooks.listBooks).not.toHaveBeenCalled());
  });
});
