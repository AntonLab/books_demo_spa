import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingListEditModal } from './ReadingListEditModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as readingListsApi from '@/api/readingLists';
import type { PublicUser } from '@/types/api';
import type {
  ReadingListDetail,
  ReadingListEditItem,
} from '@/types/readingList';

jest.mock('@/api/readingLists');

const mocked = jest.mocked(readingListsApi);

const owner = {
  id: 9,
  login: 'reader',
  firstName: 'Rita',
  lastName: 'Reader',
  avatarUrl: null,
  email: 'rita@example.com',
  role: 'user',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as PublicUser;

const list: ReadingListDetail = {
  id: 4,
  title: 'Cold nights',
  description: 'Long reads.',
  tags: ['winter'],
  owner: { id: 9, login: 'reader' },
  itemCount: 0,
  items: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const bookItem = (id: number, title: string): ReadingListEditItem =>
  ({
    id,
    kind: 'book',
    book: { id: 1, title, status: 'complete', authors: [], tags: [] },
  }) as unknown as ReadingListEditItem;

const onClose = jest.fn();
const onGone = jest.fn();

const renderModal = (
  props: { onClose: () => void; onGone?: () => void },
  session: PublicUser = owner
) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(<ReadingListEditModal listId={4} {...props} />, {
    queryClient,
  });
};

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getReadingList.mockResolvedValue(list);
  mocked.listReadingListItems.mockResolvedValue({ items: [] });
});

describe('ReadingListEditModal', () => {
  it('saves the Details and closes with a toast', async () => {
    mocked.updateReadingList.mockResolvedValue(list);
    renderModal({ onClose });
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Warm days');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mocked.updateReadingList).toHaveBeenCalledWith(4, {
        title: 'Warm days',
        description: list.description,
        tags: list.tags,
      })
    );
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText('Reading list saved.')).toBeInTheDocument();
  });

  it('asks before discarding edited Details', async () => {
    renderModal({ onClose });
    await userEvent.type(await screen.findByLabelText('Title'), ' II');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    // jsdom renders the antd confirm title twice.
    expect((await screen.findAllByText('Discard changes?')).length).not.toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deletes the list only once confirmed, then closes and calls onGone', async () => {
    mocked.deleteReadingList.mockResolvedValue(undefined);
    renderModal({ onClose, onGone });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete reading list' })
    );
    expect(mocked.deleteReadingList).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(mocked.deleteReadingList).toHaveBeenCalledWith(4)
    );
    expect(onClose).toHaveBeenCalled();
    expect(onGone).toHaveBeenCalled();
  });

  it('offers no form to anyone but the owner, an admin included', async () => {
    renderModal({ onClose }, { ...owner, id: 10, role: 'admin' });
    expect(
      await screen.findByText('Only the owner can edit this reading list.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(mocked.listReadingListItems).not.toHaveBeenCalled();
  });

  it('loads the items for the owner and shows them under the Items tab', async () => {
    mocked.listReadingListItems.mockResolvedValue({
      items: [bookItem(1, 'A Tale of Dragons')],
    });
    renderModal({ onClose });
    await userEvent.click(await screen.findByRole('tab', { name: 'Items' }));
    expect(
      await screen.findByRole('link', { name: 'A Tale of Dragons' })
    ).toBeInTheDocument();
    expect(mocked.listReadingListItems).toHaveBeenCalledWith(4);
  });
});
