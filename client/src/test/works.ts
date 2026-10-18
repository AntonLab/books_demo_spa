import type { PublicSeries } from '@/types/api';
import type { PublicBook } from '@/types/book';

const CREATED_AT = '2026-01-01T00:00:00.000Z';

export const publicBook = (
  overrides: Partial<PublicBook> = {}
): PublicBook => ({
  id: 1,
  authors: [],
  seriesId: null,
  series: null,
  title: 'Title',
  description: '',
  tags: [],
  status: 'draft',
  genre: null,
  coverUrl: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
});

export const publicSeries = (
  overrides: Partial<PublicSeries> = {}
): PublicSeries => ({
  id: 1,
  authors: [],
  title: 'Title',
  description: '',
  tags: [],
  genre: null,
  coverUrl: null,
  bookCount: 0,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
});
