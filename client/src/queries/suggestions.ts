import { useQuery } from '@tanstack/react-query';
import { SEARCH_TEXT_MAX_LENGTH } from 'shared';
import { listBooks, type ListBooksParams } from '../api/books';
import { listSeries } from '../api/series';
import type { AuthorSummary, PublicSeries } from '../types/api';
import type { PublicBook } from '../types/book';
import { queryKeys } from './keys';

const SUGGESTIONS_SIZE = 8;

// Fewer characters match too much to be worth a request.
const SUGGEST_MIN_LENGTH = 3;

// The term a suggestion request is keyed by: blank when too short, or too long
// for the server, which asks for nothing.
const suggestionTermOf = (value: string): string => {
  const term = value.trim();
  return term.length >= SUGGEST_MIN_LENGTH &&
    term.length <= SEARCH_TEXT_MAX_LENGTH
    ? term
    : '';
};

const contains = (text: string, term: string): boolean =>
  text.toLowerCase().includes(term.toLowerCase());

// A book found by its description, or a series by its, would suggest a title
// that does not hold the term.
const matchingTitles = <T extends { title: string }>(
  entries: T[],
  term: string
): T[] => entries.filter((entry) => contains(entry.title, term));

// The server finds books by any Co-author; a matched book's other Co-authors
// are left out, and each author is offered once.
const matchingAuthors = (
  authors: AuthorSummary[],
  term: string
): AuthorSummary[] => [
  ...new Map(
    authors
      .filter((author) =>
        [author.login, author.firstName, author.lastName].some((text) =>
          contains(text, term)
        )
      )
      .map((author) => [author.id, author])
  ).values(),
];

// The header search and the search form label an author the same way.
export const authorLabelOf = (author: AuthorSummary): string =>
  `${author.firstName} ${author.lastName} (${author.login})`;

// The first few books the term finds, one cache entry per term, as the
// Co-author picker does. A blank term asks for nothing, since the server
// refuses one.
// ponytail: a request per keystroke, debounce if the server feels it.
const useBookSuggestions = (field: 'q' | 'author', term: string) => {
  const params: ListBooksParams = {
    ...(field === 'q' ? { q: term } : { author: term }),
    pageSize: SUGGESTIONS_SIZE,
  };
  return useQuery({
    queryKey: queryKeys.books(params),
    queryFn: () => listBooks(params),
    enabled: term !== '',
  });
};

const useSeriesSuggestions = (term: string) => {
  const params = { q: term, limit: SUGGESTIONS_SIZE };
  return useQuery({
    queryKey: queryKeys.series(params),
    queryFn: () => listSeries(params),
    enabled: term !== '',
  });
};

interface Suggestions<T> {
  items: T[];
  isFetching: boolean;
}

// What to suggest for the raw typed `text`. Authors are found by searching
// books by author, since there is no public author search.
export function useSuggestions(
  kind: 'books',
  text: string
): Suggestions<PublicBook>;
export function useSuggestions(
  kind: 'authors',
  text: string
): Suggestions<AuthorSummary>;
export function useSuggestions(
  kind: 'series',
  text: string
): Suggestions<PublicSeries>;
export function useSuggestions(
  kind: 'books' | 'authors' | 'series',
  text: string
): Suggestions<PublicBook | AuthorSummary | PublicSeries> {
  const term = suggestionTermOf(text);
  // Hooks cannot be called conditionally, so all three run. A blank term
  // keeps the two kinds nobody asked for from requesting anything.
  const books = useBookSuggestions('q', kind === 'books' ? term : '');
  const byAuthor = useBookSuggestions('author', kind === 'authors' ? term : '');
  const series = useSeriesSuggestions(kind === 'series' ? term : '');

  if (kind === 'books') {
    return {
      items: matchingTitles(books.data?.items ?? [], term),
      isFetching: books.isFetching,
    };
  }
  if (kind === 'authors') {
    return {
      items: matchingAuthors(
        (byAuthor.data?.items ?? []).flatMap((book) => book.authors),
        term
      ),
      isFetching: byAuthor.isFetching,
    };
  }
  return {
    items: matchingTitles(series.data?.items ?? [], term),
    isFetching: series.isFetching,
  };
}
