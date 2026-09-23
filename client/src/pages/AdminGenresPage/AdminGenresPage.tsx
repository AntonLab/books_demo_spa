import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Listy,
  Popconfirm,
  Skeleton,
  Space,
  theme,
  Typography,
} from 'antd';
import { ApiError } from '@/api/client';
import { useSession } from '@/queries/auth';
import {
  useCreateGenre,
  useDeleteGenre,
  useGenres,
  useRenameGenre,
} from '@/queries/genres';
import { GENRE_NAME_MAX_LENGTH, type PublicGenre } from '@/types/genre';
import styles from './AdminGenresPage.module.css';

// The one refusal the fields explain themselves, rather than an Alert over the
// whole page: the name is what the server objected to.
const TAKEN = 'A genre with that name already exists.';

const isTaken = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 409;

interface AddValues {
  name: string;
}

// Keeping the Genre list is a Moderator's job (ADR-0008). Every other Role gets
// the heading and an explanation, the way MyBooksPage answers a non-author —
// and, because the manager below is a separate component, no request at all.
export const AdminGenresPage: FC = () => {
  const { data: session } = useSession();
  const isModerator =
    session?.role === 'admin' || session?.role === 'superadmin';

  if (!isModerator) {
    return (
      <>
        <Typography.Title level={2}>Genres</Typography.Title>
        <Alert type="info" title="Genres are kept by admins." />
      </>
    );
  }

  return <GenreManager />;
};

const GenreManager: FC = () => {
  const [form] = Form.useForm<AddValues>();
  const genres = useGenres();
  const create = useCreateGenre();

  const handleAdd = ({ name }: AddValues) => {
    create.mutate(
      { name: name.trim() },
      {
        onSuccess: () => form.resetFields(),
        onError: (error) => {
          if (isTaken(error)) {
            form.setFields([{ name: 'name', errors: [TAKEN] }]);
          }
        },
      }
    );
  };

  return (
    <>
      <Typography.Title level={2}>Genres</Typography.Title>

      {/* Anything but the 409, which the field itself already explains. */}
      {create.error && !isTaken(create.error) && (
        <Alert
          type="error"
          title={create.error.message}
          className={styles.error}
        />
      )}

      <Form<AddValues> form={form} layout="inline" onFinish={handleAdd}>
        <Form.Item
          name="name"
          label="Genre name"
          rules={[
            { required: true, whitespace: true, message: 'Enter a name' },
          ]}
        >
          {/* The server's own ceiling, imported rather than re-spelled. */}
          <Input maxLength={GENRE_NAME_MAX_LENGTH} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending}>
            Add genre
          </Button>
        </Form.Item>
      </Form>

      {/* Alphabetical with no sort here: GET /api/genres returns the list
          sorted by name, and the client never reorders what a server ordered. */}
      {genres.isError ? (
        <Alert type="error" title="Could not load the genres." />
      ) : genres.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : genres.data.items.length === 0 ? (
        <Empty description="No genres yet." />
      ) : (
        <Listy
          items={genres.data.items}
          rowKey="id"
          itemRender={(genre) => <GenreRow genre={genre} />}
        />
      )}
    </>
  );
};

// One row, with its own rename state: `draft` is null while the name is only
// being shown, and the string being typed once Rename opens the editor.
const GenreRow: FC<{ genre: PublicGenre }> = ({ genre }) => {
  const { token } = theme.useToken();
  const [draft, setDraft] = useState<string | null>(null);
  const rename = useRenameGenre(genre.id);
  const remove = useDeleteGenre(genre.id);
  const renameTaken = rename.error !== null && isTaken(rename.error);
  const renameErrorId = `genre-${genre.id}-rename-error`;

  // Opening the editor, or backing out of it, leaves this row's mutations
  // behind: without resetting them here, a 409 from a previous Save (or a
  // failed Delete) would keep rendering under a row nobody is editing.
  const handleRename = () => {
    rename.reset();
    remove.reset();
    setDraft(genre.name);
  };

  const handleCancel = () => {
    rename.reset();
    remove.reset();
    setDraft(null);
  };

  const handleSave = () => {
    const name = (draft ?? '').trim();
    if (name.length === 0 || name === genre.name) return;
    rename.mutate({ name }, { onSuccess: () => setDraft(null) });
  };

  // `orientation`, not the deprecated `direction`, which antd 6 still accepts
  // but warns about.
  return (
    <Space
      orientation="vertical"
      size={token.marginXXS}
      className={styles.list}
    >
      {draft === null ? (
        <Space wrap>
          <Typography.Text>{genre.name}</Typography.Text>
          <Button size="small" onClick={handleRename}>
            Rename
          </Button>
          <Popconfirm
            title={`Delete ${genre.name}?`}
            description="Books and series in this genre will be left without one."
            okText="Yes, delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove.mutate()}
          >
            <Button size="small" danger loading={remove.isPending}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ) : (
        <Space wrap>
          <Input
            aria-label={`New name for ${genre.name}`}
            aria-invalid={renameTaken}
            aria-describedby={renameTaken ? renameErrorId : undefined}
            value={draft}
            maxLength={GENRE_NAME_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            type="primary"
            size="small"
            disabled={draft.trim().length === 0 || draft.trim() === genre.name}
            loading={rename.isPending}
            onClick={handleSave}
          >
            Save
          </Button>
          <Button size="small" onClick={handleCancel}>
            Cancel
          </Button>
        </Space>
      )}

      {renameTaken && (
        <Typography.Text id={renameErrorId} type="danger" role="alert">
          {TAKEN}
        </Typography.Text>
      )}
      {rename.error && !renameTaken && (
        <Alert type="error" title={rename.error.message} />
      )}
      {remove.error && <Alert type="error" title={remove.error.message} />}
    </Space>
  );
};
