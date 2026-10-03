import type { FC } from 'react';
import { Pagination } from 'antd';
import { CardList } from '@/components/organisms/CardList/CardList';
import { ReadingListCard } from '@/components/organisms/ReadingListCard/ReadingListCard';
import { RESULTS_COLUMNS } from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import type { BookReadingLists } from './useBookReadingLists';
import styles from './BookReadingListsTab.module.css';

export const BookReadingListsTab: FC<{ list: BookReadingLists }> = ({
  list,
}) => (
  <>
    <CardList
      noun="reading lists"
      items={list.items}
      renderItem={(item) => (
        <ReadingListCard list={item} href={'/lists/' + item.id} />
      )}
      columns={RESULTS_COLUMNS.list}
      isPending={list.isPending}
      isError={list.error !== null}
      error={list.error}
      emptyText="Not in any reading list yet."
    />
    {!list.isPending && list.error === null && list.total > list.pageSize && (
      <Pagination
        align="center"
        showSizeChanger={false}
        className={styles.pagination}
        current={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onChange={list.goToPage}
      />
    )}
  </>
);
