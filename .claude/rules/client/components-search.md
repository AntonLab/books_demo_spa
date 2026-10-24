---
paths:
  - 'client/src/components/organisms/SearchForm/**'
---

# Search suggestions (`SearchForm`)

- It passes the raw typed text to `useSuggestions` (`queries/suggestions.ts`),
  never a value the URL fills in. The hook owns the matching rules: a term of
  3 to `SEARCH_TEXT_MAX_LENGTH` characters after trimming; authors found
  through a books-by-author search; and every answer re-filtered, since the
  server also matches descriptions and other Co-authors. The form offers each
  field its own suggestions: a book opens, and an author or series fills its
  field with the id beside it.
