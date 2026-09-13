import type { FC } from 'react';
import { Alert, Button, Space, Tabs, Typography } from 'antd';
import { useNavigate } from 'react-router';
import { BookList } from '@/components/organisms/BookList';
import { useSession } from '@/queries/auth';
import { useMyBooks } from '@/queries/books';

// Every book the signed-in author co-authors, in any status. The list comes
// from `?userId=` naming the caller, which is the one book list the server
// widens to drafts. A Series tab joins the Books tab with the series form.
export const MyBooksPage: FC = () => {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const isAuthor = session?.role === 'author';
  const books = useMyBooks(isAuthor ? session.id : undefined);

  if (!isAuthor) {
    return (
      <>
        <Typography.Title level={2}>My Books</Typography.Title>
        <Alert
          type="info"
          title="Books are kept here for accounts holding the author role."
        />
      </>
    );
  }

  return (
    <>
      <Space
        align="center"
        style={{ width: '100%', justifyContent: 'space-between' }}
      >
        <Typography.Title level={2}>My Books</Typography.Title>
        <Button type="primary" onClick={() => void navigate('/books/new')}>
          Create book
        </Button>
      </Space>

      <Tabs
        items={[
          {
            key: 'books',
            label: 'Books',
            children: (
              <BookList
                items={books.data?.items ?? []}
                isPending={books.isPending}
                isError={books.isError}
                error={books.error}
                emptyText="You have not written a book yet."
              />
            ),
          },
        ]}
      />
    </>
  );
};
