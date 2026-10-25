import { useState } from 'react';
import type { FC } from 'react';
import { Alert, Flex, Select, Typography } from 'antd';
import { SEARCH_TEXT_MAX_LENGTH } from 'shared';
import {
  SEARCH_DEBOUNCE_MS,
  useDebouncedValue,
} from '@/hooks/useDebouncedValue';
import { useOwnBooksWithoutSeries } from '@/queries/books';
import { useAddBookToSeries } from '@/queries/series';
import type { PublicUser } from '@/types/api';
import spacing from '@/theme/spacing.module.css';

interface AddBookToSeriesProps {
  seriesId: number;
  session: PublicUser;
}

export const AddBookToSeries: FC<AddBookToSeriesProps> = ({
  seriesId,
  session,
}) => {
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term, SEARCH_DEBOUNCE_MS);
  // While the typed term runs ahead of the debounced one, `candidates.data`
  // still holds the previous term's rows.
  const pending = term !== debounced;
  const candidates = useOwnBooksWithoutSeries(session.id, debounced, true);
  const add = useAddBookToSeries(seriesId);
  const searching = pending || candidates.isFetching;
  // Only an empty search over a complete page proves there is nothing to add:
  // a term with no match, or a page of series-bound books with more behind it,
  // must leave the picker usable.
  const nothingToAdd =
    term === '' &&
    !pending &&
    candidates.isSuccess &&
    candidates.data.books.length === 0 &&
    !candidates.data.more;

  return (
    <>
      {add.error && (
        <Alert
          type="error"
          title={add.error.message}
          className={spacing.gapBelow}
        />
      )}
      <Flex align="center" gap="small" className={spacing.gapBelow}>
        <Select
          aria-label="Add a book"
          placeholder="Add a book"
          showSearch
          // The server searches; filtering the returned page again would only
          // hide matches it found by description.
          filterOption={false}
          // Held to the length the server accepts: past it every search is a
          // 400, which would read here as "No books found".
          searchValue={term}
          onSearch={(value) => setTerm(value.slice(0, SEARCH_TEXT_MAX_LENGTH))}
          notFoundContent={
            searching
              ? null
              : term === ''
                ? 'Type a title to find a book'
                : 'No books found'
          }
          style={{ minWidth: 240 }}
          options={(pending ? [] : (candidates.data?.books ?? [])).map(
            (book) => ({
              value: book.id,
              label: book.title,
            })
          )}
          // Controlled and always empty: after a pick the Select returns to
          // its placeholder while the list refetches.
          value={null}
          onSelect={(bookId) => {
            add.mutate(Number(bookId));
            setTerm('');
          }}
          loading={searching || add.isPending}
          disabled={nothingToAdd}
        />
        {nothingToAdd && (
          <Typography.Text type="secondary">No books to add</Typography.Text>
        )}
      </Flex>
    </>
  );
};
