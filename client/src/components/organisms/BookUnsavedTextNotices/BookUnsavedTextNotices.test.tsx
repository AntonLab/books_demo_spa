import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookUnsavedTextNotices } from './BookUnsavedTextNotices';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import type { RootState } from '@/store';
import type { PublicUser } from '@/types/user';

const viewer: PublicUser = {
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

const savedAt = '2026-09-23T10:00:00.000Z';
const preloadedState: Partial<RootState> = {
  unsavedText: {
    accountId: 3,
    entries: {
      'book:1:comment': { text: 'About that ending', savedAt },
      'book:1:chapter:9': { title: 'Chapter One', text: 'Mine', savedAt },
      'book:12:comment': { text: 'Another book', savedAt },
    },
  },
};

const renderNotices = (session: PublicUser | null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(<BookUnsavedTextNotices bookId={1} />, {
    queryClient,
    preloadedState,
  });
};

describe('BookUnsavedTextNotices', () => {
  it('offers every entry of the Book, and only that Book', () => {
    renderNotices(viewer);

    expect(
      screen
        .getAllByRole('textbox', { name: 'Unsaved text' })
        .map((box) => (box as HTMLTextAreaElement).value)
    ).toEqual(['About that ending', 'Chapter One\n\nMine']);
  });

  it('shows nothing to a Guest', () => {
    renderNotices(null);

    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('discards one entry on request', async () => {
    const { store } = renderNotices(viewer);

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Discard' })[0]!
    );

    expect(Object.keys(store.getState().unsavedText.entries)).toEqual([
      'book:1:chapter:9',
      'book:12:comment',
    ]);
  });
});
