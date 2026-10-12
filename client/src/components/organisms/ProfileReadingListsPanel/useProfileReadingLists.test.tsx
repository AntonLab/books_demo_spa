import { waitFor } from '@testing-library/react';
import { useProfileReadingLists } from './useProfileReadingLists';
import { renderHookWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { sessionOf } from '@/test/session';
import { queryKeys } from '@/queries/keys';
import * as readingListsApi from '@/api/readingLists';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/readingLists');
const mocked = jest.mocked(readingListsApi);

const user = { id: 9, role: 'user' } as PublicUser;
const setup = (who: PublicUser | null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, who && sessionOf(who));
  return renderHookWithProviders(() => useProfileReadingLists(9), {
    route: '/profile/lists',
    queryClient,
  });
};

beforeEach(() => jest.resetAllMocks());

describe('useProfileReadingLists', () => {
  it('asks for the lists with a session user', async () => {
    mocked.listReadingLists.mockResolvedValue({
      items: [],
      total: 0,
      current: 1,
      pageSize: 20,
    });
    setup(user);

    await waitFor(() => expect(mocked.listReadingLists).toHaveBeenCalled());
  });

  it('asks for nothing as a Guest', async () => {
    const { result } = setup(null);

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(mocked.listReadingLists).not.toHaveBeenCalled();
  });
});
