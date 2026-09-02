import { useState } from 'react';
import { Input } from 'antd';
import { useNavigate, useSearchParams } from 'react-router';

// The server caps `q` at 200 characters (`z.string().min(1).max(200)`), so the
// input prevents an over-long term rather than letting it become a 400.
const MAX_QUERY_LENGTH = 200;

export function SearchBar() {
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
      style={{ maxWidth: 400 }}
    />
  );
}
