import type { FC } from 'react';
import { App, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  StarFilled,
} from '@ant-design/icons';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import {
  DELETE_BOOK_CONFIRM,
  DELETE_SERIES_CONFIRM,
} from '@/constants/deleteWork';
import { useSingleFlight } from '@/hooks/useSingleFlight';
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
  const { message, modal } = App.useApp();
  const removeFavorite = useRemoveFavorite();
  const toastError = (error: Error) => void message.error(error.message);
  const guardedRemove = useSingleFlight(async (id: number) => {
    try {
      await removeFavorite.mutateAsync(id);
    } catch (error) {
      if (error instanceof Error) toastError(error);
    }
  });

  let items: MenuProps['items'] = [];
  if (scope === 'favorites') {
    if (favoriteId !== undefined) {
      items = [
        {
          key: 'unfavorite',
          label: 'Remove from favorites',
          icon: <StarFilled aria-hidden />,
        },
      ];
    }
  } else if (mayEdit) {
    items = [
      { key: 'edit', label: 'Edit', icon: <EditOutlined aria-hidden /> },
      {
        key: 'delete',
        label: 'Delete',
        icon: <DeleteOutlined aria-hidden />,
        danger: true,
      },
    ];
  }
  if (items.length === 0) return null;

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'edit') onEdit();
    else if (key === 'unfavorite' && favoriteId !== undefined)
      void guardedRemove(favoriteId);
    else if (key === 'delete')
      modal.confirm({
        title: confirm.title,
        content: confirm.description,
        okText: confirm.okText,
        okButtonProps: { danger: true },
        onOk: () =>
          onDelete({
            onSuccess: () => void message.success(deleted),
            onError: toastError,
          }),
      });
  };

  return (
    <Dropdown
      menu={{ items, onClick: handleClick }}
      trigger={['click']}
      placement="bottomRight"
    >
      <IconButton
        size="small"
        type="text"
        icon={<EllipsisOutlined />}
        label={`More actions for ${title}`}
      />
    </Dropdown>
  );
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
