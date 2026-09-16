import { screen } from '@testing-library/react';
import { BookCard } from './BookCard';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { PublicBook } from '@/types/book';

const book: PublicBook = {
  id: 1,
  authors: [
    {
      id: 3,
      login: 'Author',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
    {
      id: 4,
      login: 'Cowriter',
      firstName: 'Cora',
      lastName: 'Writer',
      avatarUrl: null,
    },
  ],
  seriesId: null,
  title: 'A Tale of Dragons',
  description: 'A tale of dragons and the people who ride them',
  tags: ['epic', 'fantasy'],
  status: 'in_progress',
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('BookCard', () => {
  it('links the title to the book page', () => {
    renderWithProviders(<BookCard book={book} />);

    expect(
      screen.getByRole('link', { name: 'A Tale of Dragons' })
    ).toHaveAttribute('href', '/books/1');
  });

  it('names every co-author, in credit order', () => {
    renderWithProviders(<BookCard book={book} />);

    expect(screen.getByText('Ann Author, Cora Writer')).toBeInTheDocument();
  });

  it.each([
    ['draft', 'Draft'],
    ['in_progress', 'In progress'],
    ['complete', 'Complete'],
  ] as const)('labels a %s book "%s"', (status, label) => {
    renderWithProviders(<BookCard book={{ ...book, status }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders the description and every tag', () => {
    renderWithProviders(<BookCard book={book} />);

    expect(screen.getByText(book.description)).toBeInTheDocument();
    expect(screen.getByText('epic')).toBeInTheDocument();
    expect(screen.getByText('fantasy')).toBeInTheDocument();
  });

  it('renders no tags when the book has none', () => {
    renderWithProviders(<BookCard book={{ ...book, tags: [] }} />);

    expect(screen.getByText(book.description)).toBeInTheDocument();
    expect(screen.queryByText('epic')).not.toBeInTheDocument();
  });

  it('formats createdAt as a local date, not the raw ISO string', () => {
    renderWithProviders(<BookCard book={book} />);

    // The exact string is locale-dependent, so assert on what must be true:
    // the ISO timestamp is gone, and a rendered date took its place.
    expect(screen.queryByText(book.createdAt)).not.toBeInTheDocument();
    expect(
      screen.getByText(new Date(book.createdAt).toLocaleDateString())
    ).toBeInTheDocument();
  });
});
