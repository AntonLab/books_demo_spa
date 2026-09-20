import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSeriesInGenre } from './series';
import { createTestQueryClient } from '../test/queryClient';
import * as seriesApi from '../api/series';
import type { PublicSeries } from '../types/series';

jest.mock('../api/series');

const mockedSeries = jest.mocked(seriesApi);

const series: PublicSeries = {
  id: 12,
  authors: [
    {
      id: 3,
      login: 'Author',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
  ],
  title: 'The Ashgrove Chronicles',
  description: 'Letters found in a manor that should have stayed shut.',
  tags: ['gothic'],
  genre: { id: 4, name: 'Gothic' },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const wrapper = (client = createTestQueryClient()) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useSeriesInGenre', () => {
  it('asks for one page of the genre, by id', async () => {
    mockedSeries.listSeries.mockResolvedValue({
      items: [series],
      total: 1,
      limit: 20,
      offset: 0,
    });

    const { result } = renderHook(() => useSeriesInGenre(4), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([series]);
    // The same page size as the book list it sits under.
    expect(mockedSeries.listSeries).toHaveBeenCalledWith({
      genreId: 4,
      limit: 20,
    });
  });

  it('surfaces a failure as an error rather than throwing', async () => {
    mockedSeries.listSeries.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useSeriesInGenre(4), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe('Network down');
  });
});
