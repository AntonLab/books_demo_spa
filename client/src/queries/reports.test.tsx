import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useBanAccount,
  useDismissReport,
  useReportComment,
  useReportStatistics,
  useReports,
  useTakeReport,
  useUpholdReport,
} from './reports';
import { queryKeys } from './keys';
import { createTestQueryClient } from '../test/queryClient';
import { emptyStatistics, reportRow } from '../test/reports';
import { ApiError } from '../api/client';
import * as reportsApi from '../api/reports';
import * as usersApi from '../api/users';
import type { PublicUser } from '../types/api';

jest.mock('../api/reports');
jest.mock('../api/users');
const mockedReports = jest.mocked(reportsApi);
const mockedUsers = jest.mocked(usersApi);

const publicUser: PublicUser = {
  id: 7,
  login: 'bob',
  email: 'bob@example.com',
  firstName: 'Bob',
  lastName: 'Bobson',
  status: 'blocked',
  role: 'user',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const setUp = () => {
  const client = createTestQueryClient();
  const spy = jest.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return { wrapper: Wrapper, spy };
};

const renderMutation = <T,>(hook: () => T) => {
  const { wrapper, spy } = setUp();
  return { ...renderHook(hook, { wrapper }), spy };
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('report writes', () => {
  it('useReportComment refreshes the thread, the book and every report query', async () => {
    mockedReports.reportComment.mockResolvedValue({ id: 1 });
    const { result, spy } = renderMutation(() => useReportComment(1));

    await act(() =>
      result.current.mutateAsync({ commentId: 5, payload: { reason: 'spam' } })
    );

    expect(mockedReports.reportComment).toHaveBeenCalledWith(5, {
      reason: 'spam',
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.comments(1) });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.book(1) });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.allReports });
  });

  it('useTakeReport refreshes the rows and the thread even when the server answers 409', async () => {
    mockedReports.takeReport.mockRejectedValue(
      new ApiError(409, 'Already taken')
    );
    const { result, spy } = renderMutation(() => useTakeReport());

    await act(() =>
      result.current
        .mutateAsync({ commentId: 5, bookId: 1 })
        .catch(() => undefined)
    );

    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.allReports });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.comments(1) });
  });

  it('useUpholdReport also refreshes the book, since the Comment became a Tombstone', async () => {
    mockedReports.upholdReport.mockResolvedValue(undefined);
    const { result, spy } = renderMutation(() => useUpholdReport());

    await act(() => result.current.mutateAsync({ commentId: 5, bookId: 1 }));

    expect(mockedReports.upholdReport).toHaveBeenCalledWith(5);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.book(1) });
  });

  it('useDismissReport does not refresh the book', async () => {
    mockedReports.dismissReport.mockResolvedValue(undefined);
    const { result, spy } = renderMutation(() => useDismissReport());

    await act(() => result.current.mutateAsync({ commentId: 5, bookId: 1 }));

    expect(mockedReports.dismissReport).toHaveBeenCalledWith(5);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.allReports });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: queryKeys.book(1) });
  });

  it('useBanAccount calls blockUser and refreshes the reports', async () => {
    mockedUsers.blockUser.mockResolvedValue(publicUser);
    const { result, spy } = renderMutation(() => useBanAccount());

    await act(() => result.current.mutateAsync(7));

    expect(mockedUsers.blockUser).toHaveBeenCalledWith(7);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.allReports });
  });
});

describe('report reads', () => {
  it('useReports and useReportStatistics fetch under distinct keys', async () => {
    const range = { from: 'a', to: 'b' };
    mockedReports.listReports.mockResolvedValue({
      items: [reportRow()],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockedReports.getReportStatistics.mockResolvedValue(emptyStatistics());
    const { wrapper } = setUp();

    const { result } = renderHook(
      () => ({
        list: useReports(range),
        stats: useReportStatistics(range),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.list.isSuccess).toBe(true);
      expect(result.current.stats.isSuccess).toBe(true);
    });
    expect(mockedReports.listReports).toHaveBeenCalledTimes(1);
    expect(mockedReports.listReports).toHaveBeenCalledWith(range);
    expect(mockedReports.getReportStatistics).toHaveBeenCalledTimes(1);
    expect(mockedReports.getReportStatistics).toHaveBeenCalledWith(range);
    expect(result.current.list.data?.items).toHaveLength(1);
    expect(result.current.stats.data?.topAccounts).toEqual([]);
  });
});
