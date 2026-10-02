import dayjs from 'dayjs';
import {
  parseSeriesSearch,
  seriesFilterCount,
  seriesFormValuesOf,
  seriesListParamsOf,
  seriesSearchOf,
  toSeriesSearchParams,
} from './seriesSearch';

const parse = (query: string) => parseSeriesSearch(new URLSearchParams(query));

describe('parseSeriesSearch', () => {
  it('reads q, genre and tag, trimming text and dropping blanks', () => {
    expect(
      parse('tab=series&q=%20saga%20&genre=4&tag=epic&page=3&pageSize=50')
    ).toEqual({ q: 'saga', genre: '4', tag: 'epic', page: 3, pageSize: 50 });
    expect(parse('q=%20%20&tag=')).toEqual({ page: 1, pageSize: 20 });
  });

  it('falls back to defaults for a bad page or size, and ignores book-only keys', () => {
    expect(parse('page=0&pageSize=7&author=ann&sort=new')).toEqual({
      page: 1,
      pageSize: 20,
    });
  });
});

describe('toSeriesSearchParams', () => {
  it('always writes tab=series and never a default', () => {
    expect(toSeriesSearchParams({ page: 1, pageSize: 20 }).toString()).toBe(
      'tab=series'
    );
  });

  it('writes what is set, and round-trips through parseSeriesSearch', () => {
    const search = { q: 'a b', genre: '4', tag: 'x&y', page: 2, pageSize: 50 };
    const params = toSeriesSearchParams(search);

    expect(Object.fromEntries(params)).toEqual({
      ...search,
      tab: 'series',
      page: '2',
      pageSize: '50',
    });
    expect(parseSeriesSearch(params)).toEqual(search);
  });
});

describe('seriesSearchOf', () => {
  it('starts at page 1 and keeps only the series fields, trimmed', () => {
    expect(
      seriesSearchOf({
        q: ' saga ',
        tag: ' epic ',
        genre: 4,
        author: 'ann',
        releasedFrom: dayjs('2026-01-01'),
        sort: 'new',
      })
    ).toEqual({ q: 'saga', tag: 'epic', genre: '4', page: 1, pageSize: 20 });
  });
});

describe('from search to form, request and count', () => {
  const search = { q: 'saga', tag: 'epic', genre: '4', page: 3, pageSize: 50 };

  it('fills the form with the genre it resolved to, or none', () => {
    expect(seriesFormValuesOf(search, 4)).toEqual(
      expect.objectContaining({ q: 'saga', tag: 'epic', genre: 4 })
    );
    expect(seriesFormValuesOf(search, undefined).genre).toBeUndefined();
  });

  it('maps page and pageSize to limit and offset, offset 0 on page 1', () => {
    expect(seriesListParamsOf(search, 4)).toEqual({
      q: 'saga',
      genreId: 4,
      tag: 'epic',
      limit: 50,
      offset: 100,
    });
    expect(seriesListParamsOf({ page: 1, pageSize: 20 }, undefined)).toEqual({
      limit: 20,
      offset: 0,
    });
  });

  it('counts q, genre and tag, not the page', () => {
    expect(seriesFilterCount({ page: 2, pageSize: 20 })).toBe(0);
    expect(seriesFilterCount(search)).toBe(3);
  });
});
