import type { AuthorSummary, PublicSeries } from '../types/api';
import type { PublicBook } from '../types/book';
import {
  matchingAuthors,
  matchingTitles,
  suggestionTermOf,
} from '../types/searchSuggestions';
import { useBookSuggestions } from './books';
import { useSeriesSuggestions } from './series';

// The header search and the search form label an author the same way.
export const authorLabelOf = (author: AuthorSummary): string =>
  `${author.firstName} ${author.lastName} (${author.login})`;

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
