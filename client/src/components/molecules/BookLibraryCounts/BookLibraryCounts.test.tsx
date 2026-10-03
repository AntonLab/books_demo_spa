import { render, screen } from '@testing-library/react';
import { EMPTY_LIBRARY_COUNTS } from 'shared';
import { BookLibraryCounts } from './BookLibraryCounts';

describe('BookLibraryCounts', () => {
  it('shows the Library total and the three counts', () => {
    render(
      <BookLibraryCounts
        counts={{ reading: 3, planToRead: 2, read: 1, inLibraries: 6 }}
      />
    );
    expect(screen.getByText('In 6 libraries')).toBeInTheDocument();
    expect(screen.getByText('Reading 3')).toBeInTheDocument();
    expect(screen.getByText('Plan to read 2')).toBeInTheDocument();
    expect(screen.getByText('Read 1')).toBeInTheDocument();
  });

  it('says "library" for exactly one', () => {
    render(
      <BookLibraryCounts
        counts={{ reading: 1, planToRead: 0, read: 0, inLibraries: 1 }}
      />
    );
    expect(screen.getByText('In 1 library')).toBeInTheDocument();
  });

  it('shows zeros, not blanks', () => {
    render(<BookLibraryCounts counts={EMPTY_LIBRARY_COUNTS} />);
    expect(screen.getByText('In 0 libraries')).toBeInTheDocument();
    expect(screen.getByText('Reading 0')).toBeInTheDocument();
  });
});
