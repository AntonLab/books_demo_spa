import { SEARCH_TEXT_MAX_LENGTH } from 'shared';
import type { AuthorSummary } from './api';

// Fewer characters match too much to be worth a request.
const SUGGEST_MIN_LENGTH = 3;

// The term a suggestion request is keyed by: blank when too short, or too long
// for the server, which asks for nothing.
export const suggestionTermOf = (value: string): string => {
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
export const matchingTitles = <T extends { title: string }>(
  entries: T[],
  term: string
): T[] => entries.filter((entry) => contains(entry.title, term));

// The server finds books by any Co-author; a matched book's other Co-authors
// are left out, and each author is offered once.
export const matchingAuthors = (
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
