---
paths:
  - 'client/src/components/organisms/SearchBar/**'
  - 'client/src/components/organisms/SearchForm/**'
---

# Search suggestions (`SearchBar`, `SearchForm`)

- Both pass the raw typed text to `useSuggestions` (`queries/suggestions.ts`),
  never a value the URL fills in. The hook owns the matching rules: a term of
  3 to `SEARCH_TEXT_MAX_LENGTH` characters after trimming; authors found
  through a books-by-author search; and every answer re-filtered, since the
  server also matches descriptions and other Co-authors. The header groups
  books, authors and series, five each; the form offers each field its own.
  A pick in the header navigates (book, author's search, series page); in the
  form, a book opens and an author or series fills its field with the id
  beside it.
- Enter on an arrowed-to header suggestion fires `Input.Search`'s `onSearch`
  before the pick, in one keydown, so the text search waits a microtask and
  a pick cancels it. jsdom never activates an option on ArrowDown, so this is
  checked in a browser only.
- `SearchBar`'s `AutoComplete` carries `id="header-search"`: under Jest every
  rc-component id without one is `test-id`, and the bar, mounted on every
  page, would otherwise name any modal labelled by that id.
