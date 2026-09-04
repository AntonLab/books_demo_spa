import { render, screen } from '@testing-library/react';
import { BookList } from './BookList';
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

describe('BookList', () => {
  it('shows a loading state while the request is in flight', () => {
    render(
      <BookList items={[]} isPending={true} isError={false} error={null} />
    );

    expect(screen.getByLabelText('Loading books')).toBeInTheDocument();
  });

  it('shows the error message when loading failed', () => {
    render(
      <BookList
        items={[]}
        isPending={false}
        isError={true}
        error={new Error('Network down')}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
  });

  it('falls back to a generic message when the error carries none', () => {
    render(
      <BookList items={[]} isPending={false} isError={true} error={null} />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load books');
  });

  it('shows the default empty message when there are no books', () => {
    render(
      <BookList items={[]} isPending={false} isError={false} error={null} />
    );

    expect(screen.getByText('No books yet.')).toBeInTheDocument();
  });

  it('shows a caller-supplied empty message', () => {
    render(
      <BookList
        items={[]}
        isPending={false}
        isError={false}
        error={null}
        emptyText='No books match "dragon"'
      />
    );

    expect(screen.getByText('No books match "dragon"')).toBeInTheDocument();
  });

  it('renders a card per book, with its description and tags', () => {
    render(
      <BookList items={[book]} isPending={false} isError={false} error={null} />
    );

    expect(
      screen.getByText('A tale of dragons and the people who ride them')
    ).toBeInTheDocument();
    expect(screen.getByText('epic')).toBeInTheDocument();
    expect(screen.getByText('fantasy')).toBeInTheDocument();
  });

  it('does not claim an author it was not given', () => {
    render(
      <BookList items={[book]} isPending={false} isError={false} error={null} />
    );

    expect(screen.queryByText(/user\s*3/i)).toBeNull();
  });
});
