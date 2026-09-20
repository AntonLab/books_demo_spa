import { screen } from '@testing-library/react';
import { BookCard } from './BookCard';
import { renderWithProviders } from '@/test/renderWithProviders';
import { formatDate } from '@/format/date';
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
  genre: { id: 4, name: 'Gothic' },
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

  it('links the genre to its results', () => {
    renderWithProviders(<BookCard book={book} />);

    expect(screen.getByRole('link', { name: 'Gothic' })).toHaveAttribute(
      'href',
      '/search?genre=4'
    );
  });

  it('shows no genre link when the book has none', () => {
    renderWithProviders(<BookCard book={{ ...book, genre: null }} />);

    expect(screen.queryByRole('link', { name: 'Gothic' })).toBeNull();
  });

  it('names every co-author, in credit order', () => {
    renderWithProviders(<BookCard book={book} />);

    // Each name carries a trailing comma except the last — so this also
    // pins credit order: reversing the fixture would move the comma.
    expect(screen.getByText('Ann Author,')).toBeInTheDocument();
    expect(screen.getByText('Cora Writer')).toBeInTheDocument();
  });

  it('shows the cover image when the book has one', () => {
    const { container } = renderWithProviders(
      <BookCard book={{ ...book, coverUrl: '/api/books/1/cover?v=1' }} />
    );

    expect(
      container.querySelector('img[src="/api/books/1/cover?v=1"]')
    ).toHaveAttribute('alt', '');
  });

  it('shows the placeholder, not an image, when the book has no cover', () => {
    // Both authors' avatarUrl is null in the fixture too, so no <img> at
    // all — cover or avatar — should be in the card.
    const { container } = renderWithProviders(<BookCard book={book} />);

    expect(container.querySelector('img')).toBeNull();
  });

  it('shows each co-author’s avatar picture beside their own name', () => {
    // Not screen.getByRole('img'): the avatar is aria-hidden (Task 14's
    // ruling), so a container query by src is the unambiguous way to reach
    // it, and it also disambiguates it from the book's own Cover image.
    const { container } = renderWithProviders(
      <BookCard
        book={{
          ...book,
          authors: [
            { ...book.authors[0]!, avatarUrl: '/api/users/3/avatar?v=1' },
            book.authors[1]!,
          ],
        }}
      />
    );

    expect(
      container.querySelector('img[src="/api/users/3/avatar?v=1"]')
    ).toBeInTheDocument();
  });

  it('falls back to an initial for a co-author with no avatar', () => {
    renderWithProviders(<BookCard book={book} />);

    // Ann Author's initial — the fixture's first author has no avatarUrl.
    expect(screen.getByText('A')).toBeInTheDocument();
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

  it('formats createdAt with the app date helper, not the raw ISO string', () => {
    renderWithProviders(<BookCard book={book} />);

    expect(screen.queryByText(book.createdAt)).not.toBeInTheDocument();
    expect(screen.getByText(formatDate(book.createdAt))).toBeInTheDocument();
  });
});
