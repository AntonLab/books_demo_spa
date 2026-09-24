import dayjs from 'dayjs';
import { ApiError } from '../api/client';
import {
  fieldErrorsOf,
  filterCount,
  formValuesOf,
  listParamsOf,
  parseBookSearch,
  searchOf,
  toSearchParams,
  type BookSearch,
} from './bookSearch';

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

describe('form values', () => {
  it('fills the form from the URL, the genre only once it is resolved', () => {
    const values = formValuesOf(
      parse('q=dragon&genre=4&releasedFrom=2026-01-05'),
      4
    );

    expect(values.q).toBe('dragon');
    expect(values.genre).toBe(4);
    expect(values.releasedFrom?.format('YYYY-MM-DD')).toBe('2026-01-05');
    expect(values.releasedTo).toBeNull();
    expect(values.sort).toBe('popular');
    expect(formValuesOf(parse('genre=99'), undefined).genre).toBeUndefined();
  });

  it('turns submitted values into a first-page search, trimming text', () => {
    expect(
      searchOf({
        q: '  dragon ',
        author: '   ',
        genre: 4,
        releasedTo: dayjs('2026-01-10'),
        updatedFrom: null,
        sort: 'new',
      })
    ).toEqual({
      q: 'dragon',
      genre: '4',
      releasedTo: '2026-01-10',
      sort: 'new',
      page: 1,
    });
  });
});

describe('listParamsOf', () => {
  it('sends each day as an instant, from the start of a from-day to the end of a to-day', () => {
    expect(
      listParamsOf(
        parse(
          'q=dragon&status=complete&releasedFrom=2026-01-05&releasedTo=2026-01-10&page=2'
        ),
        4
      )
    ).toEqual({
      q: 'dragon',
      genreId: 4,
      status: 'complete',
      releasedFrom: dayjs('2026-01-05').startOf('day').toISOString(),
      releasedTo: dayjs('2026-01-10').endOf('day').toISOString(),
      sort: 'popular',
      current: 2,
      pageSize: 20,
    });
  });
});

describe('filterCount', () => {
  it('counts each filter once, a range as one, and not the sort', () => {
    expect(filterCount(parse('sort=new'))).toBe(0);
    expect(
      filterCount(
        parse(
          'q=a&status=complete&releasedFrom=2026-01-01&releasedTo=2026-01-02&updatedTo=2026-01-03'
        )
      )
    ).toBe(4);
  });
});

describe('fieldErrorsOf', () => {
  it('moves each issue of a 400 onto the field it names', () => {
    const error = new ApiError(400, 'Request validation failed', [
      { path: ['author'], message: 'Too big' },
      { path: ['genreId'], message: 'Invalid input' },
      { path: ['current'], message: 'Too small' },
      { path: ['releasedFrom'], message: 'Must not be after the end date.' },
    ]);

    expect(fieldErrorsOf(error)).toEqual([
      { name: 'author', errors: ['Too big'] },
      { name: 'genre', errors: ['Invalid input'] },
      { name: 'releasedFrom', errors: ['Must not be after the end date.'] },
    ]);
  });

  it('has nothing to place for any other failure', () => {
    expect(fieldErrorsOf(new ApiError(500, 'Boom'))).toEqual([]);
    expect(fieldErrorsOf(new Error('Network down'))).toEqual([]);
    expect(fieldErrorsOf(null)).toEqual([]);
  });
});
