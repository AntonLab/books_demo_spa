import type { FC } from 'react';
import { App, Flex, Select } from 'antd';
import { READING_STATUSES } from 'shared';
import { ListPagination } from '@/components/molecules/ListPagination/ListPagination';
import { ReadingStatusSelect } from '@/components/molecules/ReadingStatusSelect/ReadingStatusSelect';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import { RESULTS_COLUMNS } from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import { useSetReadingStatus } from '@/queries/library';
import spacing from '@/theme/spacing.module.css';
import { LIBRARY_FILTERS, type LibraryBook } from '@/types/library';
import { useLibraryList } from './useLibraryList';
import styles from './LibraryPanel.module.css';

const emptyTextOf = (filtered: boolean): string =>
  filtered ? 'No books with this status.' : 'Your Library is empty.';

// One hook per row, so only the row being changed is disabled.
const LibraryRow: FC<{ row: LibraryBook }> = ({ row }) => {
  const { message } = App.useApp();
  const setStatus = useSetReadingStatus();
  return (
    <Flex gap="small" align="flex-start">
      <div className={styles.card}>
        <BookCard book={row} />
      </div>
      <ReadingStatusSelect
        id={`reading-status-${row.id}`}
        value={row.readingStatus}
        disabled={setStatus.isPending}
        onChange={(status) =>
          setStatus.mutate(
            { bookId: row.id, status },
            { onError: (error) => void message.error(error.message) }
          )
        }
      />
    </Flex>
  );
};

export const LibraryPanel: FC = () => {
  const list = useLibraryList();

  return (
    <>
      <Flex className={spacing.gapBelow}>
        <Select
          aria-label="Filter by reading status"
          value={list.status ?? 'all'}
          options={[...LIBRARY_FILTERS]}
          popupMatchSelectWidth={false}
          onChange={(value) =>
            list.setStatus(READING_STATUSES.find((status) => status === value))
          }
        />
      </Flex>
      <CardList
        noun="books"
        items={list.items}
        renderItem={(row) => <LibraryRow row={row} />}
        columns={RESULTS_COLUMNS.list}
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
