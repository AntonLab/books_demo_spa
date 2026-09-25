import type { FC } from 'react';
import { useRef, useState } from 'react';
import { AutoComplete, Input, Spin, theme } from 'antd';
import { useNavigate, useSearchParams } from 'react-router';
import { SEARCH_TEXT_MAX_LENGTH } from 'shared';
import { useBookSuggestions } from '@/queries/books';
import { useSeriesSuggestions } from '@/queries/series';
import { searchPath } from '@/types/bookSearch';
import {
  authorLabelOf,
  matchingAuthors,
  matchingTitles,
  suggestionTermOf,
} from '@/types/searchSuggestions';
import styles from './SearchBar.module.css';

// Fewer than the search form offers per field: three groups share one list.
const GROUP_SIZE = 5;
const GROUPS = 3;

// Each option's value is where picking it goes, which also keeps the values
// unique across the groups.
const groupOf = (label: string, options: { value: string; label: string }[]) =>
  options.length === 0
    ? []
    : [{ label, options: options.slice(0, GROUP_SIZE) }];

export const SearchBar: FC = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [searchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q') ?? '';
  const [value, setValue] = useState(queryFromUrl);
  // Set only by typing, so a `?q=` arriving from the URL asks for nothing.
  const [term, setTerm] = useState('');
  const books = useBookSuggestions('q', term);
  const byAuthor = useBookSuggestions('author', term);
  const series = useSeriesSuggestions(term);

  // The URL is the source of truth; the input follows it, so a paste, a
  // reload and a back-button press all leave the bar showing the live query.
  // Adjusted during render rather than in a useEffect — react-hooks flags
  // setState-in-effect as a cascading-render risk, and React's own guidance
  // for "reset state when a prop changes" is this prev-value comparison done
  // while rendering, not after.
  const [prevQueryFromUrl, setPrevQueryFromUrl] = useState(queryFromUrl);
  if (queryFromUrl !== prevQueryFromUrl) {
    setPrevQueryFromUrl(queryFromUrl);
    setValue(queryFromUrl);
  }

  const options = [
    ...groupOf(
      'Books',
      matchingTitles(books.data?.items ?? [], term).map((book) => ({
        value: `/books/${book.id}`,
        label: book.title,
      }))
    ),
    ...groupOf(
      'Authors',
      matchingAuthors(
        (byAuthor.data?.items ?? []).flatMap((book) => book.authors),
        term
      ).map((author) => ({
        value: searchPath({ author: author.login, authorId: author.id }),
        label: authorLabelOf(author),
      }))
    ),
    ...groupOf(
      'Series',
      matchingTitles(series.data?.items ?? [], term).map((entry) => ({
        value: `/series/${entry.id}`,
        label: entry.title,
      }))
    ),
  ];
  const isFetching =
    books.isFetching || byAuthor.isFetching || series.isFetching;

  // Enter on an arrowed-to suggestion reaches Input.Search's onSearch first
  // and the pick second, in the same keydown. So a search waits out that
  // event, and a pick in it cancels the search; without this, Back from the
  // book would land on a search nobody asked for.
  const justPicked = useRef(false);

  // A pick is not a search for what was typed, so the bar empties, as it
  // would on a page with no `?q=`.
  const pick = (path: string) => {
    justPicked.current = true;
    queueMicrotask(() => {
      justPicked.current = false;
    });
    setValue('');
    setTerm('');
    void navigate(path);
  };

  const handleSearch = (
    text: string,
    _event?: unknown,
    info?: { source?: 'input' | 'clear' }
  ) => {
    // antd fires onSearch for the clear icon as well as for Enter and the
    // button. Navigating on a clear would run a search for the term the user
    // just erased.
    //
    // On antd 6.6.2, clearing actually forces `text` to `''` before this
    // handler ever sees it (@rc-component/input's resolveOnChange clones the
    // event with the target value hard-coded to '' for a click-type change),
    // so the empty-text guard below currently blocks this path too — the two
    // guards are redundant today, and no test isolates this one alone: the
    // isolated case (source === 'clear' with a non-empty text) can't be
    // reached through the real component, only synthesized, and a test built
    // on that synthetic input would be pinning our handler against a case
    // antd itself never produces. Kept anyway, deliberately, because that
    // redundancy rides on resolveOnChange's internals, not on onSearch's
    // documented contract — the contract only promises the callback fires on
    // clear, not that the value comes through empty. If a future antd ever
    // passes the erased text through instead, this guard is what stops it
    // from being navigated to.
    if (info?.source === 'clear') {
      setTerm('');
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }

    queueMicrotask(() => {
      if (!justPicked.current) {
        void navigate(searchPath({ q: trimmed }));
      }
    });
  };

  return (
    <AutoComplete
      // Its own id: without one, rc-component's generated ids all read
      // `test-id` under Jest, and this bar, on every page, would then name
      // any modal whose title is labelled by that id.
      id="header-search"
      className={styles.search}
      // Input.Search draws the field; the select's own box would frame it.
      variant="borderless"
      value={value}
      onChange={setValue}
      options={options}
      // Tall enough for three full groups, headings included, so none hides
      // below a scroll; each row is a control's height.
      listHeight={token.controlHeight * GROUPS * (GROUP_SIZE + 1)}
      onSelect={pick}
      // Enter searches the text typed unless a suggestion was arrowed to.
      defaultActiveFirstOption={false}
      // The server already matched the term; antd filtering again would drop
      // an author matched by first name.
      showSearch={{
        filterOption: false,
        onSearch: (text) => setTerm(suggestionTermOf(text)),
      }}
      // AutoComplete takes no `loading`; until a group lands the list is
      // empty, so its empty slot holds the spinner.
      notFoundContent={
        isFetching ? (
          <Spin size="small" aria-label="Loading suggestions" />
        ) : null
      }
    >
      <Input.Search
        aria-label="Search books"
        placeholder="Search books by title or description"
        maxLength={SEARCH_TEXT_MAX_LENGTH}
        onSearch={handleSearch}
        allowClear
        enterButton
      />
    </AutoComplete>
  );
};
