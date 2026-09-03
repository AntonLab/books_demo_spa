import { useEffect } from 'react';
import { Typography } from 'antd';
import { BookList } from '../components/books/BookList';
import { fetchBooks } from '../store/booksSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

export function MainPage() {
  const dispatch = useAppDispatch();
  const { items, status, error } = useAppSelector((state) => state.books);

  useEffect(() => {
    void dispatch(fetchBooks());
  }, [dispatch]);

  return (
    <>
      <Typography.Title level={2}>Books</Typography.Title>
      <BookList items={items} status={status} error={error} />
    </>
  );
}
