import type { FC } from 'react';
import { Typography } from 'antd';
import { BookList } from '@/components/organisms/BookList';
import { useBooks } from '@/queries/books';

export const MainPage: FC = () => {
  // No effect and no dispatch: a query runs because something reads it.
  const { data, isPending, isError, error } = useBooks();

  return (
    <>
      <Typography.Title level={2}>Books</Typography.Title>
      <BookList
        items={data?.items ?? []}
        isPending={isPending}
        isError={isError}
        error={error}
      />
    </>
  );
};
