import { render, screen } from '@testing-library/react';
import { PublicProfileTab } from './PublicProfileTab';
import type { AccountProfile } from '@/types/api';

const profile: AccountProfile = {
  id: 7,
  firstName: 'Margaret',
  lastName: 'Hale',
  avatarUrl: null,
  about: 'Hello there',
  lastSeenAt: null,
  bookCount: 0,
  seriesCount: 0,
  totals: {
    booksInReadingLists: 11,
    seriesInReadingLists: 12,
    bookLikes: 13,
    seriesLikes: 14,
    commentsOnBooks: 15,
    favorites: 16,
  },
};

describe('PublicProfileTab', () => {
  it('shows About and each total beside its own label', () => {
    render(<PublicProfileTab profile={profile} />);

    expect(screen.getByText('Hello there')).toBeInTheDocument();
    const pairs: [string, string][] = [
      ['Books in reading lists', '11'],
      ['Series in reading lists', '12'],
      ['Book likes', '13'],
      ['Series likes', '14'],
      ['Comments on books', '15'],
      ['Favorites', '16'],
    ];
    for (const [label, value] of pairs) {
      expect(screen.getByText(label).parentElement).toHaveTextContent(
        new RegExp(`${label}\\s*${value}$`)
      );
    }
  });

  it('shows no About block when About is empty or only whitespace', () => {
    render(<PublicProfileTab profile={{ ...profile, about: '  \n ' }} />);

    expect(screen.queryByText(/about/i)).toBeNull();
    expect(screen.getByText('Book likes')).toBeInTheDocument();
  });
});
