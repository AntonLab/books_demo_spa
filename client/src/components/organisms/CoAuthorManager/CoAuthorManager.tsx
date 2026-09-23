import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Flex,
  Listy,
  Popconfirm,
  Select,
  Space,
  theme,
  Typography,
} from 'antd';
import { AUTHOR_SEARCH_MAX_LENGTH } from 'shared';
import { AccountAvatar } from '@/components/molecules/AccountAvatar';
import { useAuthorSearch } from '@/queries/authors';
import {
  useAddCoAuthor,
  useRemoveCoAuthor,
  type CreditedWork,
} from '@/queries/coAuthors';
import type { AuthorSummary } from '@/types/user';
import type { DefaultOptionType } from 'antd/es/select';
import styles from './CoAuthorManager.module.css';

// A typed stand-in for antd's own `DefaultOptionType`, whose extra fields
// fall back to an index signature typed `any`. Naming `avatarUrl` and `name`
// here is what makes `optionRender` below type-check them as
// `string | null` and `string` rather than silently accepting a typo.
interface CandidateOption extends DefaultOptionType {
  value: number;
  label: string;
  avatarUrl: string | null;
  name: string;
}

interface CoAuthorManagerProps {
  // A book or a series: both keep their Co-authors the same way, through
  // parallel endpoints.
  work: CreditedWork;
  authors: AuthorSummary[];
  // Whoever is signed in, so their own row offers Leave rather than Remove.
  viewerId: number;
  // True for a Co-author. A Moderator may edit a work but never change who is
  // credited on it, so for anyone else the list is read-only.
  canManage: boolean;
  // Called once the viewer has left: the work is no longer theirs to edit.
  onLeave: () => void;
}

const nameOf = (author: AuthorSummary): string =>
  `${author.firstName} ${author.lastName}`;

// Every action here is its own request, unlike the work's fields: a credit is
// one request each, and the server's answer — a refusal included — belongs
// next to the list it changes rather than behind a Save button. Only leaving
// asks first, because it cannot be undone from this page.
export const CoAuthorManager: FC<CoAuthorManagerProps> = ({
  work,
  authors,
  viewerId,
  canManage,
  onLeave,
}) => {
  const { token } = theme.useToken();
  const [term, setTerm] = useState('');
  const search = useAuthorSearch(term);
  const add = useAddCoAuthor(work);
  const remove = useRemoveCoAuthor(work);

  const failure = add.error ?? remove.error;
  const credited = new Set(authors.map((author) => author.id));
  // The last Co-author cannot leave; the server refuses it with a 409, so it is
  // not offered. They delete the work instead.
  const canLeave = authors.length > 1;

  const candidates = (search.data ?? []).filter(
    (author) => !credited.has(author.id)
  );

  return (
    <section>
      <Typography.Title level={4}>Co-authors</Typography.Title>

      {failure && (
        <Alert type="error" title={failure.message} className={styles.error} />
      )}

      <Listy
        items={authors}
        rowKey="id"
        itemRender={(author) => {
          const isViewer = author.id === viewerId;
          const loading = remove.isPending && remove.variables === author.id;
          const actions =
            !canManage || (isViewer && !canLeave)
              ? []
              : isViewer
                ? [
                    <Popconfirm
                      key="action"
                      title={`Leave this ${work.kind}?`}
                      description="Only its other co-authors can credit you again."
                      okText="Yes, leave"
                      onConfirm={() =>
                        remove.mutate(author.id, { onSuccess: onLeave })
                      }
                    >
                      <Button size="small" loading={loading}>
                        Leave
                      </Button>
                    </Popconfirm>,
                  ]
                : [
                    <Button
                      key="action"
                      size="small"
                      danger
                      loading={loading}
                      onClick={() => remove.mutate(author.id)}
                    >
                      Remove
                    </Button>,
                  ];

          return (
            <Flex justify="space-between" align="center" gap={token.marginXS}>
              <Space size={token.marginXS}>
                <AccountAvatar
                  avatarUrl={author.avatarUrl}
                  name={nameOf(author)}
                  size="small"
                />
                {nameOf(author)}
              </Space>
              {actions}
            </Flex>
          );
        }}
      />

      {canManage && (
        <Select<number, CandidateOption>
          showSearch
          aria-label="Add a co-author"
          placeholder="Search authors by name or login"
          className={styles.picker}
          // The server searches; filtering the returned page again would only
          // hide matches it found by first or last name.
          filterOption={false}
          // Held to the length the server accepts: past it every search is a
          // 400, which would read here as "No authors found".
          searchValue={term}
          onSearch={(value) =>
            setTerm(value.slice(0, AUTHOR_SEARCH_MAX_LENGTH))
          }
          value={null}
          loading={search.isFetching}
          notFoundContent={search.isFetching ? null : 'No authors found'}
          options={candidates.map((author): CandidateOption => ({
            value: author.id,
            label: `${nameOf(author)} (${author.login})`,
            avatarUrl: author.avatarUrl,
            name: nameOf(author),
          }))}
          // Keeping `label` a plain string preserves antd's own derived
          // `title` (used for the option's tooltip, and by this component's
          // tests) and rc-select's search-filter matching; drawing the
          // avatar through optionRender instead avoids the breakage a
          // ReactNode label would cause there (Ruling P9).
          optionRender={(option) => (
            <Space size={token.marginXS}>
              <AccountAvatar
                avatarUrl={option.data.avatarUrl}
                name={option.data.name}
                size="small"
              />
              {option.label}
            </Space>
          )}
          onSelect={(userId) => {
            add.mutate(userId);
            setTerm('');
          }}
        />
      )}
    </section>
  );
};
