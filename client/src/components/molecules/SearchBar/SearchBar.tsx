import type { FC } from 'react';
import { useState } from 'react';
import { Input, theme } from 'antd';
import { useNavigate, useSearchParams } from 'react-router';

// The server caps `q` at 200 characters (`z.string().min(1).max(200)`), so the
// input prevents an over-long term rather than letting it become a 400.
const MAX_QUERY_LENGTH = 200;

export const SearchBar: FC = () => {
  // The max width is a quark, not a literal — see CLAUDE.md, Atomic Design
  // rule 4, and `appSearchBarMaxWidth` in `src/theme/tokens.ts`.
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q') ?? '';
  const [value, setValue] = useState(queryFromUrl);

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

  function handleSearch(
    term: string,
    _event?: unknown,
    info?: { source?: 'input' | 'clear' }
  ) {
    // antd fires onSearch for the clear icon as well as for Enter and the
    // button. Navigating on a clear would run a search for the term the user
    // just erased.
    //
    // On antd 6.6.2, clearing actually forces `term` to `''` before this
    // handler ever sees it (@rc-component/input's resolveOnChange clones the
    // event with the target value hard-coded to '' for a click-type change),
    // so the empty-term guard below currently blocks this path too — the two
    // guards are redundant today, and no test isolates this one alone: the
    // isolated case (source === 'clear' with a non-empty term) can't be
    // reached through the real component, only synthesized, and a test built
    // on that synthetic input would be pinning our handler against a case
    // antd itself never produces. Kept anyway, deliberately, because that
    // redundancy rides on resolveOnChange's internals, not on onSearch's
    // documented contract — the contract only promises the callback fires on
    // clear, not that the value comes through empty. If a future antd ever
    // passes the erased text through instead, this guard is what stops it
    // from being navigated to.
    if (info?.source === 'clear') {
      return;
    }

    const trimmed = term.trim();
    if (trimmed.length === 0) {
      return;
    }

    void navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <Input.Search
      aria-label="Search books"
      // Honest about what the server actually matches: `?q=` filters on
      // `description`, and books have no title column.
      placeholder="Search books by description"
      maxLength={MAX_QUERY_LENGTH}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onSearch={handleSearch}
      allowClear
      enterButton
      style={{ maxWidth: token.appSearchBarMaxWidth }}
    />
  );
};
