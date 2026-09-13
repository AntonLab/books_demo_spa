import { useState } from 'react';
import type { FC } from 'react';
import { Alert, Button, List, Select, theme, Typography } from 'antd';
import { useAuthorSearch } from '@/queries/authors';
import { useAddCoAuthor, useRemoveCoAuthor } from '@/queries/books';
import type { AuthorSummary } from '@/types/user';

interface CoAuthorManagerProps {
  bookId: number;
  authors: AuthorSummary[];
  // Whoever is signed in, so their own row offers Leave rather than Remove.
  viewerId: number;
  // True for a Co-author. A Moderator may edit a book but never change who is
  // credited on it, so for anyone else the list is read-only.
  canManage: boolean;
  // Called once the viewer has left: the book is no longer theirs to edit.
  onLeave: () => void;
}

const nameOf = (author: AuthorSummary): string =>
  `${author.firstName} ${author.lastName}`;

// Every action here is immediate, unlike the book's fields: a credit is one
// request each, and the server's answer — a refusal included — belongs next
// to the list it changes rather than behind a Save button.
export const CoAuthorManager: FC<CoAuthorManagerProps> = ({
  bookId,
  authors,
  viewerId,
  canManage,
  onLeave,
}) => {
  const { token } = theme.useToken();
  const [term, setTerm] = useState('');
  const search = useAuthorSearch(term);
  const add = useAddCoAuthor(bookId);
  const remove = useRemoveCoAuthor(bookId);

  const failure = add.error ?? remove.error;
  const credited = new Set(authors.map((author) => author.id));
  // The last Co-author cannot leave; the server refuses it with a 409, so it is
  // not offered. They delete the book instead.
  const canLeave = authors.length > 1;

  const candidates = (search.data ?? []).filter(
    (author) => !credited.has(author.id)
  );

  return (
    <section>
      <Typography.Title level={4}>Co-authors</Typography.Title>

      {failure && (
        <Alert
          type="error"
          title={failure.message}
          style={{ marginBottom: token.margin }}
        />
      )}

      <List
        dataSource={authors}
        rowKey="id"
        renderItem={(author) => {
          const isViewer = author.id === viewerId;
          const actions =
            !canManage || (isViewer && !canLeave)
              ? []
              : [
                  <Button
                    key="action"
                    size="small"
                    danger={!isViewer}
                    loading={remove.isPending && remove.variables === author.id}
                    onClick={() =>
                      remove.mutate(author.id, {
                        onSuccess: isViewer ? onLeave : undefined,
                      })
                    }
                  >
                    {isViewer ? 'Leave' : 'Remove'}
                  </Button>,
                ];

          return <List.Item actions={actions}>{nameOf(author)}</List.Item>;
        }}
      />

      {canManage && (
        <Select<number>
          showSearch
          aria-label="Add a co-author"
          placeholder="Search authors by name or login"
          style={{ width: '100%', marginTop: token.margin }}
          // The server searches; filtering the returned page again would only
          // hide matches it found by first or last name.
          filterOption={false}
          searchValue={term}
          onSearch={setTerm}
          value={null}
          loading={search.isFetching}
          notFoundContent={search.isFetching ? null : 'No authors found'}
          options={candidates.map((author) => ({
            value: author.id,
            label: `${nameOf(author)} (${author.login})`,
          }))}
          onSelect={(userId) => {
            add.mutate(userId);
            setTerm('');
          }}
        />
      )}
    </section>
  );
};
