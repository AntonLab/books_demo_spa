import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddToReadingList } from './AddToReadingList';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ApiError } from '@/api/client';
import * as readingListsApi from '@/api/readingLists';
import type { WorkTarget } from '@/api/readingLists';
import type {
  MyReadingList,
  PublicReadingList,
  ReadingListItem,
} from '@/types/readingList';

jest.mock('@/api/readingLists');

const mocked = jest.mocked(readingListsApi);

const mine = (
  id: number,
  title: string,
  itemCount: number,
  itemId: number | null
): MyReadingList => ({ id, title, itemCount, itemId });

const createdList: PublicReadingList = {
  id: 8,
  title: 'Warm days',
  description: '',
  tags: [],
  owner: { id: 9, login: 'reader' },
  itemCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// The control reads nothing from the added item, so only its id is set.
const item = { id: 20 } as ReadingListItem;

const openFor = async (target: WorkTarget) => {
  renderWithProviders(<AddToReadingList target={target} />);
  await userEvent.click(
    screen.getByRole('button', { name: 'Add to reading list' })
  );
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('AddToReadingList', () => {
  it("asks for the caller's lists only once opened, for this Book", async () => {
    renderWithProviders(<AddToReadingList target={{ bookId: 7 }} />);
    expect(mocked.listMyReadingLists).not.toHaveBeenCalled();
    mocked.listMyReadingLists.mockResolvedValue({
      items: [mine(4, 'Cold nights', 2, null)],
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Add to reading list' })
    );
    expect(
      await screen.findByRole('checkbox', { name: /Cold nights/ })
    ).not.toBeChecked();
    expect(mocked.listMyReadingLists).toHaveBeenCalledWith({ bookId: 7 });
  });

  it('checks the lists that hold the work, and a check adds it at once', async () => {
    mocked.listMyReadingLists.mockResolvedValue({
      items: [mine(4, 'Cold nights', 2, 9), mine(5, 'Warm days', 0, null)],
    });
    mocked.addReadingListItem.mockResolvedValue(item);
    await openFor({ bookId: 7 });
    expect(
      await screen.findByRole('checkbox', { name: /Cold nights/ })
    ).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: /Warm days/ }));
    await waitFor(() =>
      expect(mocked.addReadingListItem).toHaveBeenCalledWith(5, { bookId: 7 })
    );
  });

  it("an uncheck removes the work's item from that list", async () => {
    mocked.listMyReadingLists.mockResolvedValue({
      items: [mine(4, 'Cold nights', 2, 9)],
    });
    mocked.removeReadingListItem.mockResolvedValue(undefined);
    await openFor({ seriesId: 12 });
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /Cold nights/ })
    );
    await waitFor(() =>
      expect(mocked.removeReadingListItem).toHaveBeenCalledWith(4, 9)
    );
    expect(mocked.listMyReadingLists).toHaveBeenCalledWith({ seriesId: 12 });
  });

  it('after a 409 or 404 shows the error and loads the lists again', async () => {
    mocked.listMyReadingLists.mockResolvedValue({
      items: [mine(4, 'Cold nights', 2, null)],
    });
    mocked.addReadingListItem.mockRejectedValue(
      new ApiError(409, 'Already in this reading list')
    );
    await openFor({ bookId: 7 });
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /Cold nights/ })
    );
    expect(
      await screen.findByText('Already in this reading list')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocked.listMyReadingLists).toHaveBeenCalledTimes(2)
    );
  });

  it('creates a list from a title and puts the work in it', async () => {
    mocked.listMyReadingLists.mockResolvedValue({ items: [] });
    mocked.createReadingList.mockResolvedValue(createdList);
    mocked.addReadingListItem.mockResolvedValue(item);
    await openFor({ bookId: 7 });
    expect(
      await screen.findByText(
        'You have no reading lists yet. Create one below.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create and add' })
    ).toBeDisabled();
    await userEvent.type(screen.getByLabelText('New list title'), 'Warm days');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create and add' })
    );
    await waitFor(() =>
      expect(mocked.createReadingList).toHaveBeenCalledWith({
        title: 'Warm days',
        description: '',
        tags: [],
      })
    );
    await waitFor(() =>
      expect(mocked.addReadingListItem).toHaveBeenCalledWith(createdList.id, {
        bookId: 7,
      })
    );
  });

  it('keeps the typed title and shows the message when the create fails', async () => {
    mocked.listMyReadingLists.mockResolvedValue({ items: [] });
    mocked.createReadingList.mockRejectedValue(
      new ApiError(400, 'Title is too long')
    );
    await openFor({ bookId: 7 });
    await userEvent.type(
      await screen.findByLabelText('New list title'),
      'Warm days'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create and add' })
    );
    expect(await screen.findByText('Title is too long')).toBeInTheDocument();
    expect(screen.getByLabelText('New list title')).toHaveValue('Warm days');
    expect(mocked.addReadingListItem).not.toHaveBeenCalled();
  });
});
