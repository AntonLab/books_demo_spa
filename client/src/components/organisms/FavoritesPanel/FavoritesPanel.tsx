import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Empty,
  Flex,
  Listy,
  Pagination,
  Skeleton,
  Space,
  Tabs,
  Typography,
} from 'antd';
import { Link } from 'react-router';
import {
  FAVORITES_PAGE_SIZE,
  useFavoriteBooks,
  useFavoriteSeries,
  useRemoveFavorite,
} from '@/queries/favorites';

// One row of either tab. `id` is the Favorite's own id, which Remove sends;
// the work's id only builds the link.
interface FavoriteRow {
  id: number;
  href: string;
  title: string;
  authors: readonly { firstName: string; lastName: string }[];
}

interface FavoriteListProps {
  rows: FavoriteRow[] | undefined;
  total: number;
  isPending: boolean;
  isError: boolean;
  page: number;
  onPageChange: (page: number) => void;
  emptyText: string;
  errorText: string;
}

const FavoriteList: FC<FavoriteListProps> = ({
  rows,
  total,
  isPending,
  isError,
  page,
  onPageChange,
  emptyText,
  errorText,
}) => {
  const remove = useRemoveFavorite();

  if (isError) return <Alert type="error" title={errorText} />;
  if (isPending || rows === undefined) {
    return <Skeleton active paragraph={{ rows: 3 }} />;
  }
  if (rows.length === 0) return <Empty description={emptyText} />;

  return (
    // Flex, not margins: the gaps between the alert, the list and the pager
    // need no class of their own.
    <Flex vertical gap="middle">
      {remove.isError && (
        <Alert type="error" title="Could not remove this favorite." />
      )}
      <Listy
        items={rows}
        rowKey="id"
        itemRender={(row) => (
          <Flex justify="space-between" align="center" gap="small">
            <Space direction="vertical" size={0}>
              <Link to={row.href}>{row.title}</Link>
              <Typography.Text type="secondary">
                {row.authors
                  .map((author) => `${author.firstName} ${author.lastName}`)
                  .join(', ')}
              </Typography.Text>
            </Space>
            <Button
              size="small"
              // Every row's button reads "Remove"; the title tells them apart.
              aria-label={`Remove ${row.title} from favorites`}
              loading={remove.isPending && remove.variables === row.id}
              onClick={() => remove.mutate(row.id)}
            >
              Remove
            </Button>
          </Flex>
        )}
      />
      <Pagination
        align="center"
        current={page}
        pageSize={FAVORITES_PAGE_SIZE}
        total={total}
        showSizeChanger={false}
        hideOnSinglePage
        onChange={onPageChange}
      />
    </Flex>
  );
};

const lastPageOf = (total: number) =>
  Math.max(1, Math.ceil(total / FAVORITES_PAGE_SIZE));

// Each tab clamps its page while rendering, not in an effect, so the empty
// page a removal leaves behind (its only row gone) never paints. While a
// new page loads, data is undefined and nothing is clamped.
const FavoriteBooksTab: FC = () => {
  const [page, setPage] = useState(1);
  const books = useFavoriteBooks(page);
  if (books.data !== undefined && page > lastPageOf(books.data.total)) {
    setPage(lastPageOf(books.data.total));
  }

  return (
    <FavoriteList
      rows={books.data?.items.map((favorite) => ({
        id: favorite.id,
        href: `/books/${favorite.book.id}`,
        title: favorite.book.title,
        authors: favorite.book.authors,
      }))}
      total={books.data?.total ?? 0}
      isPending={books.isPending}
      isError={books.isError}
      page={page}
      onPageChange={setPage}
      emptyText="No book is in your favorites yet."
      errorText="Could not load your favorite books."
    />
  );
};

const FavoriteSeriesTab: FC = () => {
  const [page, setPage] = useState(1);
  const series = useFavoriteSeries(page);
  if (series.data !== undefined && page > lastPageOf(series.data.total)) {
    setPage(lastPageOf(series.data.total));
  }

  return (
    <FavoriteList
      rows={series.data?.items.map((favorite) => ({
        id: favorite.id,
        href: `/series/${favorite.series.id}`,
        title: favorite.series.title,
        authors: favorite.series.authors,
      }))}
      total={series.data?.total ?? 0}
      isPending={series.isPending}
      isError={series.isError}
      page={page}
      onPageChange={setPage}
      emptyText="No series is in your favorites yet."
      errorText="Could not load your favorite series."
    />
  );
};

// The signed-in Account's own Favorites; the server takes the Account from
// the session, so there is no id to pass.
export const FavoritesPanel: FC = () => (
  <Tabs
    items={[
      { key: 'books', label: 'Books', children: <FavoriteBooksTab /> },
      { key: 'series', label: 'Series', children: <FavoriteSeriesTab /> },
    ]}
  />
);
