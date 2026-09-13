import { request } from './client';
import type { ListResponse } from '../types/api';
import type { PublicSeries } from '../types/series';

export interface ListSeriesParams {
  userId?: number;
  limit?: number;
}

// Only what the book form needs so far: the series a Co-author can file a book
// under, which is `?userId=` naming them.
export const listSeries = (
  params: ListSeriesParams = {}
): Promise<ListResponse<PublicSeries>> => {
  const search = new URLSearchParams();
  if (params.userId !== undefined) search.set('userId', String(params.userId));
  if (params.limit !== undefined) search.set('limit', String(params.limit));

  const query = search.toString();
  return request<ListResponse<PublicSeries>>(
    query ? `/series?${query}` : '/series'
  );
};
