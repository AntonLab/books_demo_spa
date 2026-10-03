import { parsePublicList, toPublicListParams } from './publicProfileLists';

describe('parsePublicList', () => {
  it('reads the defaults from an empty query', () => {
    expect(parsePublicList(new URLSearchParams(''))).toEqual({
      sort: 'popular',
      page: 1,
      pageSize: 20,
    });
  });

  it('reads sort, page and page size', () => {
    expect(
      parsePublicList(new URLSearchParams('sort=new&page=3&pageSize=50'))
    ).toEqual({ sort: 'new', page: 3, pageSize: 50 });
  });

  it('falls back to the defaults for values it cannot use', () => {
    expect(
      parsePublicList(new URLSearchParams('sort=bogus&page=0&pageSize=7'))
    ).toEqual({ sort: 'popular', page: 1, pageSize: 20 });
  });
});

describe('toPublicListParams', () => {
  it('leaves out the defaults', () => {
    expect(
      toPublicListParams({ sort: 'popular', page: 1, pageSize: 20 }).toString()
    ).toBe('');
  });

  it('writes what differs', () => {
    expect(
      toPublicListParams({
        sort: 'updated',
        page: 2,
        pageSize: 100,
      }).toString()
    ).toBe('sort=updated&page=2&pageSize=100');
  });
});
