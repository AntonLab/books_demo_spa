import { useState } from 'react';
import type { FC } from 'react';
import { Button, Flex } from 'antd';
import { useNavigate } from 'react-router';
import { ListPagination } from '@/components/molecules/ListPagination/ListPagination';
import { CardList } from '@/components/organisms/CardList/CardList';
import { ReadingListCard } from '@/components/organisms/ReadingListCard/ReadingListCard';
import { ReadingListCreateModal } from '@/components/organisms/ReadingListCreateModal/ReadingListCreateModal';
import { RESULTS_COLUMNS } from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import spacing from '@/theme/spacing.module.css';
import { useProfileReadingLists } from './useProfileReadingLists';
import styles from './ProfileReadingListsPanel.module.css';

export const ProfileReadingListsPanel: FC<{ viewerId: number }> = ({
  viewerId,
}) => {
  const list = useProfileReadingLists(viewerId);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Flex justify="flex-end" className={spacing.gapBelow}>
        <Button type="primary" onClick={() => setCreating(true)}>
          New reading list
        </Button>
      </Flex>
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
        emptyText="You have no reading lists yet."
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
      {creating && (
        <ReadingListCreateModal
          onClose={() => setCreating(false)}
          onCreated={(created) => void navigate('/lists/' + created.id)}
        />
      )}
    </>
  );
};
