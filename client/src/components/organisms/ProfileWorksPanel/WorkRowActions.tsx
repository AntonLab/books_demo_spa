import { useState } from 'react';
import type { FC, ReactNode } from 'react';
import { App, Flex, Popconfirm } from 'antd';
import { DeleteOutlined, EditOutlined, StarFilled } from '@ant-design/icons';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import {
  DELETE_BOOK_CONFIRM,
  DELETE_SERIES_CONFIRM,
} from '@/constants/deleteWork';
import { useDeleteBook } from '@/queries/books';
import { useSession } from '@/queries/auth';
import { useRemoveFavorite } from '@/queries/favorites';
import { useDeleteSeries } from '@/queries/series';
import { bookCapabilities, seriesCapabilities } from '@/types/capabilities';
import type { PublicSeries } from '@/types/api';
import type { PublicBook } from '@/types/book';
import type { ProfileScope } from '@/types/profileScope';

type Confirm = typeof DELETE_BOOK_CONFIRM | typeof DELETE_SERIES_CONFIRM;

interface RowButtonsProps {
  scope: ProfileScope;
  title: string;
  mayEdit: boolean;
  favoriteId: number | undefined;
  confirm: Confirm;
  deleted: string;
  onEdit: () => void;
  onDelete: (handlers: {
    onSuccess: () => void;
    onError: (error: Error) => void;
  }) => void;
}

const RowButtons: FC<RowButtonsProps> = ({
  scope,
  title,
  mayEdit,
  favoriteId,
  confirm,
  deleted,
  onEdit,
  onDelete,
}) => {
  const { message } = App.useApp();
  const removeFavorite = useRemoveFavorite();
  const [confirming, setConfirming] = useState(false);
  const toastError = (error: Error) => void message.error(error.message);

  let buttons: ReactNode = null;
  if (scope === 'favorites') {
    if (favoriteId !== undefined) {
      buttons = (
        <IconButton
          size="small"
          type="text"
          icon={<StarFilled />}
          label={`Remove ${title} from favorites`}
          onClick={() =>
            removeFavorite.mutate(favoriteId, { onError: toastError })
          }
        />
      );
    }
  } else if (mayEdit) {
    buttons = (
      <>
        <IconButton
          size="small"
          type="text"
          icon={<EditOutlined />}
          label={`Edit ${title}`}
          onClick={onEdit}
        />
        <Popconfirm
          {...confirm}
          okButtonProps={{ danger: true }}
          onConfirm={() =>
            onDelete({
              onSuccess: () => void message.success(deleted),
              onError: toastError,
            })
          }
          onOpenChange={setConfirming}
        >
          <IconButton
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            tooltipHidden={confirming}
            label={`Delete ${title}`}
          />
        </Popconfirm>
      </>
    );
  }
  return buttons === null ? null : <Flex vertical>{buttons}</Flex>;
};

interface BookRowActionsProps {
  scope: ProfileScope;
  book: PublicBook & { favoriteId?: number };
  onEdit: () => void;
}

export const BookRowActions: FC<BookRowActionsProps> = ({
  scope,
  book,
  onEdit,
}) => {
  const { data: session } = useSession();
  const remove = useDeleteBook(book.id);
  return (
    <RowButtons
      scope={scope}
      title={book.title}
      mayEdit={bookCapabilities(book, session).mayEdit}
      favoriteId={book.favoriteId}
      confirm={DELETE_BOOK_CONFIRM}
      deleted="Book deleted."
      onEdit={onEdit}
      onDelete={(handlers) => remove.mutate(undefined, handlers)}
    />
  );
};

interface SeriesRowActionsProps {
  scope: ProfileScope;
  series: PublicSeries & { favoriteId?: number };
  onEdit: () => void;
}

export const SeriesRowActions: FC<SeriesRowActionsProps> = ({
  scope,
  series,
  onEdit,
}) => {
  const { data: session } = useSession();
  const remove = useDeleteSeries(series.id);
  return (
    <RowButtons
      scope={scope}
      title={series.title}
      mayEdit={seriesCapabilities(series, session).mayEdit}
      favoriteId={series.favoriteId}
      confirm={DELETE_SERIES_CONFIRM}
      deleted="Series deleted."
      onEdit={onEdit}
      onDelete={(handlers) => remove.mutate(undefined, handlers)}
    />
  );
};
