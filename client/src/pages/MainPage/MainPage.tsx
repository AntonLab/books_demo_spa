import { useId, type FC } from 'react';
import { Flex, Typography } from 'antd';
import { Link } from 'react-router';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import {
  CardList,
  TILE_COLUMNS,
} from '@/components/organisms/CardList/CardList';
import { useSortedBooks } from '@/queries/books';
import { BOOK_SORT_LABELS, BOOK_SORTS, type BookSort } from '@/types/book';
import styles from './MainPage.module.css';

const SECTION_SIZE = 6;

export const MainPage: FC = () => (
  <>
    {BOOK_SORTS.map((sort) => (
      <Section key={sort} sort={sort} />
    ))}
  </>
);

// Each section loads and fails on its own, and stays in place when empty so the
// page keeps its shape.
const Section: FC<{ sort: BookSort }> = ({ sort }) => {
  const headingId = useId();
  const { data, isPending, isError, error } = useSortedBooks(
    sort,
    SECTION_SIZE
  );

  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <Flex
        justify="space-between"
        align="center"
        gap="middle"
        className={styles.bar}
      >
        <Typography.Title id={headingId} level={2} className={styles.heading}>
          {BOOK_SORT_LABELS[sort]}
        </Typography.Title>
        {data !== undefined && data.total > SECTION_SIZE && (
          <Link to={`/search?sort=${sort}`}>Show more</Link>
        )}
      </Flex>
      <CardList
        noun="books"
        items={data?.items ?? []}
        renderItem={(book) => <BookCard book={book} tile />}
        columns={TILE_COLUMNS}
        isPending={isPending}
        isError={isError}
        error={error}
      />
    </section>
  );
};
