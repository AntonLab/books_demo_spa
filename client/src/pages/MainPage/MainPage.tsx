import type { FC } from 'react';
import { Typography } from 'antd';
import { BookCard } from '@/components/organisms/BookCard';
import { CardList } from '@/components/organisms/CardList';
import { useBooks } from '@/queries/books';

export const MainPage: FC = () => {
  // No effect and no dispatch: a query runs because something reads it.
  const { data, isPending, isError, error } = useBooks();

  return (
    <>
      <Typography.Title level={2}>Books</Typography.Title>
      <CardList
        noun="books"
        items={data?.items ?? []}
        renderItem={(book) => <BookCard book={book} />}
        isPending={isPending}
        isError={isError}
        error={error}
      />
    </>
  );
};
