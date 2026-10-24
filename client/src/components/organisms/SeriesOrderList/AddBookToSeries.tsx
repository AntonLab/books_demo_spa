import type { FC } from 'react';
import { Alert, Flex, Select, Typography } from 'antd';
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
  const candidates = useOwnBooksWithoutSeries(session.id, true);
  const add = useAddBookToSeries(seriesId);
  const nothingToAdd = candidates.isSuccess && candidates.data.length === 0;

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
          optionFilterProp="label"
          style={{ minWidth: 240 }}
          options={(candidates.data ?? []).map((book) => ({
            value: book.id,
            label: book.title,
          }))}
          // Controlled and always empty: after a pick the Select returns to
          // its placeholder while the list refetches.
          value={null}
          onChange={(bookId: number) => add.mutate(bookId)}
          loading={candidates.isPending || add.isPending}
          disabled={nothingToAdd}
        />
        {nothingToAdd && (
          <Typography.Text type="secondary">No books to add</Typography.Text>
        )}
      </Flex>
    </>
  );
};
