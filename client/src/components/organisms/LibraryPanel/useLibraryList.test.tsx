import { waitFor } from '@testing-library/react';
import { useLibraryList } from './useLibraryList';
import { renderHookWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { sessionOf } from '@/test/session';
import { queryKeys } from '@/queries/keys';
import * as libraryApi from '@/api/library';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/library');
const mockedLibrary = jest.mocked(libraryApi);

const user = { id: 3, role: 'user' } as PublicUser;
const setup = (who: PublicUser | null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, who && sessionOf(who));
  return renderHookWithProviders(() => useLibraryList(), {
    route: '/profile/library',
    queryClient,
  });
};

beforeEach(() => jest.resetAllMocks());

describe('useLibraryList', () => {
  it('asks for the Library with a session user', async () => {
    mockedLibrary.listLibrary.mockResolvedValue({
      items: [],
      total: 0,
      current: 1,
      pageSize: 20,
    });
    setup(user);

    await waitFor(() => expect(mockedLibrary.listLibrary).toHaveBeenCalled());
  });

  it('asks for nothing as a Guest', async () => {
    const { result } = setup(null);

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(mockedLibrary.listLibrary).not.toHaveBeenCalled();
  });
});
