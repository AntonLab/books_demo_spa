import {
  parseBookSearch,
  searchPath,
  toSearchParams,
  type BookSearch,
} from './bookSearch';

// How the search sits in the URL. What the page makes of it (form values,
// the request, the filter count, a 400's issues) is tested with
// useSearchPage.

const parse = (query: string) => parseBookSearch(new URLSearchParams(query));

describe('parseBookSearch', () => {
  it('starts from the whole catalogue: popular, page 1', () => {
    expect(parse('')).toEqual({ sort: 'popular', page: 1 });
  });

  it('reads every field, trimming text and dropping blanks', () => {
    expect(
      parse(
        'q=%20dragon%20&author=ann&seriesTitle=%20%20&genre=4&status=complete' +
          '&releasedFrom=2026-01-05&releasedTo=2026-01-10&updatedFrom=2026-02-01' +
          '&updatedTo=2026-02-02&sort=new&page=3'
      )
    ).toEqual({
      q: 'dragon',
      author: 'ann',
      genre: '4',
      status: 'complete',
      releasedFrom: '2026-01-05',
      releasedTo: '2026-01-10',
      updatedFrom: '2026-02-01',
      updatedTo: '2026-02-02',
      sort: 'new',
      page: 3,
    });
  });

  it('treats an unknown status or sort, an impossible day and a bad page as empty', () => {
    expect(
      parse(
        'status=draft&sort=oldest&releasedFrom=2026-02-30&updatedTo=yesterday&page=0'
      )
    ).toEqual({ sort: 'popular', page: 1 });
    expect(parse('page=abc').page).toBe(1);
    expect(parse('page=2.5').page).toBe(1);
  });

  it('ignores ?series=', () => {
    expect(parse('series=12')).toEqual({ sort: 'popular', page: 1 });
  });
});

describe('picked author and series ids', () => {
  it('reads an id only beside its text, and only a positive integer', () => {
    expect(
      parse('author=annlee&authorId=3&seriesTitle=Saga&seriesId=2')
    ).toMatchObject({ authorId: 3, seriesId: 2 });

    const orphaned = parse('authorId=3&seriesId=2');
    expect(orphaned.authorId).toBeUndefined();
    expect(orphaned.seriesId).toBeUndefined();

    for (const bad of ['0', '-1', '2.5', 'abc', '01']) {
      expect(parse(`author=a&authorId=${bad}`).authorId).toBeUndefined();
    }
  });

  it('round-trips through the URL', () => {
    const search: BookSearch = {
      author: 'annlee',
      authorId: 3,
      seriesTitle: 'Saga',
      seriesId: 2,
      sort: 'popular',
      page: 1,
    };

    expect(parseBookSearch(toSearchParams(search))).toEqual(search);
  });
});

describe('toSearchParams', () => {
  it('writes only what is set, leaving out the default sort and page 1', () => {
    expect(toSearchParams({ sort: 'popular', page: 1 }).toString()).toBe('');
    expect(
      toSearchParams({
        q: 'dragon',
        author: 'ann',
        genre: '4',
        releasedFrom: '2026-01-05',
        sort: 'updated',
        page: 2,
      }).toString()
    ).toBe(
      'q=dragon&author=ann&genre=4&releasedFrom=2026-01-05&sort=updated&page=2'
    );
  });

  it('round-trips through parseBookSearch', () => {
    const search: BookSearch = {
      q: 'dragon',
      seriesTitle: 'ash',
      status: 'in_progress',
      updatedTo: '2026-03-01',
      sort: 'new',
      page: 4,
    };
    expect(parseBookSearch(toSearchParams(search))).toEqual(search);
  });
});

describe('searchPath', () => {
  it('is a bare /search for the whole catalogue, leaving the defaults out', () => {
    expect(searchPath({})).toBe('/search');
    expect(searchPath({ sort: 'popular', page: 1 })).toBe('/search');
  });

  it('links a genre, a ranking or a picked author as the search page writes them', () => {
    expect(searchPath({ genre: '3' })).toBe('/search?genre=3');
    expect(searchPath({ sort: 'new' })).toBe('/search?sort=new');
    expect(searchPath({ author: 'annlee', authorId: 3 })).toBe(
      '/search?author=annlee&authorId=3'
    );
  });

  it('writes a space as %20 and a plus as %2B', () => {
    expect(searchPath({ q: 'dragon riders' })).toBe(
      '/search?q=dragon%20riders'
    );
    expect(searchPath({ q: 'a+b' })).toBe('/search?q=a%2Bb');
  });
});
