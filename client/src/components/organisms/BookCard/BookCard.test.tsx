import { render, screen } from '@testing-library/react';
import { BookCard } from './BookCard';
import type { PublicBook } from '@/types/book';

const book: PublicBook = {
  id: 1,
  userId: 3,
  seriesId: null,
  description: 'A tale of dragons and the people who ride them',
  tags: ['epic', 'fantasy'],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('BookCard', () => {
  it('renders the description and every tag', () => {
    render(<BookCard book={book} />);

    expect(screen.getByText(book.description)).toBeInTheDocument();
    expect(screen.getByText('epic')).toBeInTheDocument();
    expect(screen.getByText('fantasy')).toBeInTheDocument();
  });

  it('renders no tags when the book has none', () => {
    render(<BookCard book={{ ...book, tags: [] }} />);

    expect(screen.getByText(book.description)).toBeInTheDocument();
    expect(screen.queryByText('epic')).not.toBeInTheDocument();
  });

  it('formats createdAt as a local date, not the raw ISO string', () => {
    render(<BookCard book={book} />);

    // The exact string is locale-dependent, so assert on what must be true:
    // the ISO timestamp is gone, and a rendered date took its place.
    expect(screen.queryByText(book.createdAt)).not.toBeInTheDocument();
    expect(
      screen.getByText(new Date(book.createdAt).toLocaleDateString())
    ).toBeInTheDocument();
  });
});
