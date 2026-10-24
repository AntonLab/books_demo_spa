import type { FC } from 'react';
import { App, Button, Flex, Select } from 'antd';
import { READING_STATUSES } from 'shared';
import { ListPagination } from '@/components/molecules/ListPagination/ListPagination';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import {
  RESULTS_COLUMNS,
  ResultsLayoutSwitch,
} from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import { useBookLibraryActions } from '@/queries/library';
import { useResultsLayout } from '@/store/hooks';
import spacing from '@/theme/spacing.module.css';
import { LIBRARY_FILTERS, type LibraryBook } from '@/types/library';
import { useLibraryList } from './useLibraryList';
import styles from './LibraryPanel.module.css';

const emptyTextOf = (filtered: boolean): string =>
  filtered ? 'No books with this status.' : 'Your Library is empty.';

// One hook per row, so only the row being changed is disabled.
const LibraryRow: FC<{ row: LibraryBook; tile: boolean }> = ({ row, tile }) => {
  const { message } = App.useApp();
  const { remove } = useBookLibraryActions();
  return (
    <Flex
      vertical={tile}
      gap="small"
      align={tile ? 'stretch' : 'flex-start'}
      wrap={tile ? undefined : 'wrap'}
    >
      <div className={tile ? styles.tile : styles.card}>
        <BookCard book={row} tile={tile} />
      </div>
      <Button
        aria-label={`Remove ${row.title} from Library`}
        disabled={remove.isPending}
        onClick={() =>
          remove.mutate(row.id, {
            onError: (error) => void message.error(error.message),
          })
        }
      >
        Remove
      </Button>
    </Flex>
  );
};

export const LibraryPanel: FC = () => {
  const list = useLibraryList();
  const layout = useResultsLayout();

  return (
    <>
      <Flex justify="space-between" align="center" className={spacing.gapBelow}>
        <Select
          aria-label="Filter by reading status"
          value={list.status ?? 'all'}
          options={[...LIBRARY_FILTERS]}
          popupMatchSelectWidth={false}
          onChange={(value) =>
            list.setStatus(READING_STATUSES.find((status) => status === value))
          }
        />
        <ResultsLayoutSwitch />
      </Flex>
      <CardList
        noun="books"
        items={list.items}
        renderItem={(row) => <LibraryRow row={row} tile={layout === 'grid'} />}
        columns={RESULTS_COLUMNS[layout]}
        isPending={list.isPending}
        isError={list.error !== null}
        error={list.error}
        emptyText={emptyTextOf(list.status !== undefined)}
      />
      {!list.isPending && list.error === null && (
        <ListPagination
          className={styles.pagination}
          current={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onChange={list.goToPage}
        />
      )}
    </>
  );
};
