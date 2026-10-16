import { screen } from '@testing-library/react';
import { ReadingListCard } from './ReadingListCard';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { PublicReadingList } from '@/types/readingList';

const list: PublicReadingList = {
  id: 4,
  title: 'Cold nights',
  description: '',
  tags: [],
  owner: { id: 9, firstName: 'Rita', lastName: 'Reader', status: 'active' },
  itemCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('ReadingListCard', () => {
  it('shows the title, owner name, Description, Tags and the shown item count', () => {
    renderWithProviders(
      <ReadingListCard
        list={{
          ...list,
          itemCount: 3,
          tags: ['cosy'],
          description: 'For rainy days',
        }}
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Cold nights' })
    ).toBeInTheDocument();
    expect(screen.getByText('by')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rita Reader' })).toHaveAttribute(
      'href',
      '/accounts/9'
    );
    expect(screen.queryByText('reader')).toBeNull();
    expect(screen.getByText('For rainy days')).toBeInTheDocument();
    expect(screen.getByText('cosy')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('names a Blocked owner as plain text', () => {
    renderWithProviders(
      <ReadingListCard
        list={{ ...list, owner: { ...list.owner, status: 'blocked' } }}
      />
    );
    expect(screen.getByText('by Rita Reader')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Rita Reader' })).toBeNull();
  });

  it('says "1 item" for one and links the title to the page when given an href', () => {
    renderWithProviders(
      <ReadingListCard list={{ ...list, itemCount: 1 }} href="/lists/4" />
    );
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cold nights' })).toHaveAttribute(
      'href',
      '/lists/4'
    );
  });
});
