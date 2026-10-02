import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingListCreateModal } from './ReadingListCreateModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ApiError } from '@/api/client';
import * as readingListsApi from '@/api/readingLists';
import type { PublicReadingList } from '@/types/readingList';

jest.mock('@/api/readingLists');

const mocked = jest.mocked(readingListsApi);

const list: PublicReadingList = {
  id: 4,
  title: 'Cold nights',
  description: '',
  tags: [],
  owner: { id: 9, login: 'reader' },
  itemCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ReadingListCreateModal', () => {
  it('creates from a title alone, closes, and hands the new list to onCreated', async () => {
    mocked.createReadingList.mockResolvedValue(list);
    const onClose = jest.fn();
    const onCreated = jest.fn();
    renderWithProviders(
      <ReadingListCreateModal onClose={onClose} onCreated={onCreated} />
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Cold nights');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create reading list' })
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(list));
    expect(mocked.createReadingList).toHaveBeenCalledWith({
      title: 'Cold nights',
      description: '',
      tags: [],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the modal open and shows the server message when the create fails', async () => {
    mocked.createReadingList.mockRejectedValue(
      new ApiError(400, 'Title is too long')
    );
    const onClose = jest.fn();
    renderWithProviders(<ReadingListCreateModal onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Cold nights');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create reading list' })
    );
    expect(await screen.findByText('Title is too long')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks before discarding typed input', async () => {
    const onClose = jest.fn();
    renderWithProviders(<ReadingListCreateModal onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Cold nights');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect((await screen.findAllByText('Discard changes?')).length).not.toBe(0);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });
});
