import { useState } from 'react';
import type { FC } from 'react';
import { Alert, Button, Flex, Popconfirm, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '@/api/client';
import { GoneRedirect } from '@/components/molecules/GoneRedirect/GoneRedirect';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import { ReadingListCard } from '@/components/organisms/ReadingListCard/ReadingListCard';
import { ReadingListEditModal } from '@/components/organisms/ReadingListEditModal/ReadingListEditModal';
import { RESULTS_COLUMNS } from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import { SeriesCard } from '@/components/organisms/SeriesCard/SeriesCard';
import { useSession } from '@/queries/auth';
import {
  useCopyReadingList,
  useDeleteReadingList,
  useReadingList,
} from '@/queries/readingLists';
import { readingListCapabilities } from '@/types/capabilities';
import spacing from '@/theme/spacing.module.css';
import styles from './ReadingListPage.module.css';

const LIST_GONE = 'This reading list no longer exists.';

export const ReadingListPage: FC = () => {
  const listId = Number(useParams().id);
  // Not an id the server could answer for, so it is not asked.
  return Number.isInteger(listId) && listId > 0 ? (
    <ReadingListView listId={listId} />
  ) : (
    <GoneRedirect message={LIST_GONE} />
  );
};

const ReadingListView: FC<{ listId: number }> = ({ listId }) => {
  const navigate = useNavigate();
  const list = useReadingList(listId);
  const { data: session } = useSession();
  const remove = useDeleteReadingList(listId);
  const copy = useCopyReadingList();
  const [editing, setEditing] = useState(false);

  if (list.isError) {
    return list.error instanceof ApiError && list.error.status === 404 ? (
      <GoneRedirect message={LIST_GONE} />
    ) : (
      <Alert type="error" title="Could not load this reading list." />
    );
  }
  if (list.isPending) return <Skeleton active paragraph={{ rows: 3 }} />;

  const { mayEdit, mayCopy } = readingListCapabilities(
    list.data,
    session ?? null
  );
  const toProfile = () => void navigate('/profile/lists');

  return (
    <>
      <ReadingListCard list={list.data} />
      <Flex justify="end" align="center" gap="middle" className={styles.bar}>
        {mayEdit && (
          <>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Popconfirm
              title="Delete this reading list?"
              okText="Delete reading list"
              okButtonProps={{ danger: true }}
              onConfirm={() =>
                remove.mutate(undefined, { onSuccess: toProfile })
              }
            >
              <Button danger loading={remove.isPending}>
                Delete
              </Button>
            </Popconfirm>
          </>
        )}
        {mayCopy && (
          <Button
            loading={copy.isPending}
            onClick={() =>
              copy.mutate(listId, {
                onSuccess: (made) => void navigate(`/lists/${made.id}`),
              })
            }
          >
            Add to mine
          </Button>
        )}
      </Flex>
      {editing && (
        <ReadingListEditModal
          listId={listId}
          onClose={() => setEditing(false)}
          onGone={toProfile}
        />
      )}
      {(copy.error ?? remove.error) && (
        <Alert
          type="error"
          title={(copy.error ?? remove.error)?.message}
          className={spacing.gapBelow}
        />
      )}
      <CardList
        noun="items"
        items={list.data.items}
        renderItem={(item) =>
          item.kind === 'book' ? (
            <BookCard book={item.book} />
          ) : (
            <SeriesCard
              series={item.series}
              href={`/series/${item.series.id}`}
            />
          )
        }
        columns={RESULTS_COLUMNS.list}
        isPending={false}
        isError={false}
        error={null}
        emptyText="No items in this reading list yet."
      />
    </>
  );
};
