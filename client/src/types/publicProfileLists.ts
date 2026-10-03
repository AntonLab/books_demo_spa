import { BOOK_SORTS, type BookSort } from 'shared';
import { DEFAULT_PAGE_SIZE } from '../constants/pagination';
import { pagingOf } from './bookSearch';

export interface PublicListState {
  sort: BookSort;
  page: number;
  pageSize: number;
}

export const parsePublicList = (params: URLSearchParams): PublicListState => {
  const sort = BOOK_SORTS.find((entry) => entry === params.get('sort'));
  return { sort: sort ?? 'popular', ...pagingOf(params) };
};

// The defaults are left out, so a fresh list is a bare profile URL.
export const toPublicListParams = (state: PublicListState): URLSearchParams => {
  const params = new URLSearchParams();
  if (state.sort !== 'popular') params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set('pageSize', String(state.pageSize));
  }
  return params;
};
