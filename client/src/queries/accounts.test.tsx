import { waitFor } from '@testing-library/react';
import { usePublicProfile } from './accounts';
import { renderHookWithProviders } from '../test/renderWithProviders';
import * as accountsApi from '../api/accounts';
import type { AccountProfile } from '../types/api';

jest.mock('../api/accounts');
const mockedAccounts = jest.mocked(accountsApi);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('usePublicProfile', () => {
  it('fetches the profile of the given Account', async () => {
    const profile: AccountProfile = {
      id: 7,
      firstName: 'Ann',
      lastName: 'Lee',
      avatarUrl: null,
      about: '',
      lastSeenAt: null,
      bookCount: 0,
      seriesCount: 0,
      totals: {
        booksInReadingLists: 0,
        seriesInReadingLists: 0,
        bookLikes: 0,
        seriesLikes: 0,
        commentsOnBooks: 0,
        favorites: 0,
      },
    };
    mockedAccounts.getAccountProfile.mockResolvedValue(profile);

    const { result } = renderHookWithProviders(() => usePublicProfile(7));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedAccounts.getAccountProfile).toHaveBeenCalledWith(7);
    expect(result.current.data).toEqual(profile);
  });

  it('asks for nothing while the id is undefined', () => {
    renderHookWithProviders(() => usePublicProfile(undefined));

    expect(mockedAccounts.getAccountProfile).not.toHaveBeenCalled();
  });
});
