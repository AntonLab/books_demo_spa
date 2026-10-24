import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import type { ReadingStatus } from 'shared';
import { LibraryPanel } from './LibraryPanel';
import { renderWithProviders } from '@/test/renderWithProviders';
import { seededClient } from '@/test/session';
import { publicBook } from '@/test/works';
import * as libraryApi from '@/api/library';
import { ApiError } from '@/api/client';
import type { PublicUser } from '@/types/api';
import type { LibraryBook } from '@/types/library';

jest.mock('@/api/library');
const mockedLibrary = jest.mocked(libraryApi);

const entry = (
  id: number,
  title: string,
  readingStatus: ReadingStatus
): LibraryBook => ({
  ...publicBook({
    id,
    title,
    status: 'complete',
    authors: [
      {
        id: 3,
        login: 'ann',
        firstName: 'Ann',
        lastName: 'Author',
        status: 'active',
        avatarUrl: null,
      },
    ],
    description: 'D.',
  }),
  readingStatus,
});
const page = (
  items: LibraryBook[],
  total = items.length,
  current = 1,
  pageSize = 20
) => ({ items, total, current, pageSize });
// A clamped title is also rendered once more, hidden, so match the link.
const titleLink = (title: string) => screen.findByRole('link', { name: title });
const Probe = () => <div data-testid="search">{useLocation().search}</div>;
const renderPanel = (route = '/profile/library') =>
  renderWithProviders(
    <>
      <LibraryPanel />
      <Probe />
    </>,
    {
      route,
      queryClient: seededClient({ id: 3, role: 'user' } as PublicUser),
    }
  );

describe('LibraryPanel', () => {
  beforeEach(() => jest.resetAllMocks());

  it('lists the books with their statuses, asking for every status but Not interested', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading'), entry(2, 'Tides', 'read')])
    );
    renderPanel();
    expect(await titleLink('Dragons')).toBeInTheDocument();
    expect(await titleLink('Tides')).toBeInTheDocument();
    expect(mockedLibrary.listLibrary).toHaveBeenCalledWith({
      status: undefined,
      current: 1,
      pageSize: 20,
    });
  });

  it('filters by a status and resets to page 1', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading')], 45, 2)
    );
    renderPanel('/profile/library?page=2');
    await titleLink('Dragons');
    await userEvent.click(
      screen.getByRole('combobox', { name: 'Filter by reading status' })
    );
    await userEvent.click(screen.getByTitle('Not interested'));
    expect(screen.getByTestId('search')).toHaveTextContent(
      '?status=not_interested'
    );
    await waitFor(() =>
      expect(mockedLibrary.listLibrary).toHaveBeenLastCalledWith({
        status: 'not_interested',
        current: 1,
        pageSize: 20,
      })
    );
  });

  it('reads a bad status or page as the default', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'read')])
    );
    renderPanel('/profile/library?status=nonsense&page=abc');
    await titleLink('Dragons');
    expect(mockedLibrary.listLibrary).toHaveBeenCalledWith({
      status: undefined,
      current: 1,
      pageSize: 20,
    });
  });

  it('steps back when the page is past the end', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(page([], 25, 3));
    renderPanel('/profile/library?page=3');
    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?page=2')
    );
  });

  it('offers Remove on each row, and no status select', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading'), entry(2, 'Tides', 'read')])
    );
    renderPanel();
    await titleLink('Dragons');
    expect(
      screen.getByRole('button', { name: 'Remove Dragons from Library' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove Tides from Library' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Reading status' })
    ).not.toBeInTheDocument();
  });

  it('removes a row by its book id, and disables only that row while pending', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading'), entry(2, 'Tides', 'read')])
    );
    mockedLibrary.clearReadingStatus.mockReturnValue(new Promise(() => {}));
    renderPanel();
    await titleLink('Dragons');
    const first = screen.getByRole('button', {
      name: 'Remove Dragons from Library',
    });
    const second = screen.getByRole('button', {
      name: 'Remove Tides from Library',
    });
    await userEvent.click(second);
    expect(mockedLibrary.clearReadingStatus).toHaveBeenCalledWith(2);
    await waitFor(() => expect(second).toBeDisabled());
    expect(first).toBeEnabled();
  });

  it('offers Remove on a Not interested row', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'not_interested')])
    );
    mockedLibrary.clearReadingStatus.mockResolvedValue(undefined);
    renderPanel('/profile/library?status=not_interested');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Dragons from Library' })
    );
    expect(mockedLibrary.clearReadingStatus).toHaveBeenCalledWith(1);
  });

  it('refetches the list after a removal', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading')])
    );
    mockedLibrary.clearReadingStatus.mockResolvedValue(undefined);
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Dragons from Library' })
    );
    await waitFor(() =>
      expect(mockedLibrary.listLibrary).toHaveBeenCalledTimes(2)
    );
  });

  it('toasts a failed removal', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading')])
    );
    mockedLibrary.clearReadingStatus.mockRejectedValue(
      new ApiError(404, 'Book 1 not found')
    );
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Dragons from Library' })
    );
    expect(await screen.findByText('Book 1 not found')).toBeInTheDocument();
  });

  it('says so when the Library is empty, and differently under a filter', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(page([]));
    renderPanel();
    expect(
      await screen.findByText('Your Library is empty.')
    ).toBeInTheDocument();
    renderPanel('/profile/library?status=read');
    expect(
      await screen.findByText('No books with this status.')
    ).toBeInTheDocument();
  });

  it('shows an error when the list fails to load', async () => {
    mockedLibrary.listLibrary.mockRejectedValue(new ApiError(500, 'boom'));
    renderPanel();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
