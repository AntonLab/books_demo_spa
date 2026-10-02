import type { FC } from 'react';
import { Alert, Button, Form, Input, Select, Space } from 'antd';
import { GENRE_NAME_MAX_LENGTH } from 'shared';
import type {
  AdminGenreListItem,
  GenrePayload,
  GenreUpdatePayload,
} from 'shared';
import { ApiError } from '@/api/client';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import { useCreateGenre, useUpdateGenre } from '@/queries/genres';
import { parentChoices } from '@/types/genreAdmin';
import { buildGenreTree } from '@/types/genreTree';

export type GenreFormMode =
  | { kind: 'create'; parentId: number | null }
  | { kind: 'edit'; genre: AdminGenreListItem };

interface GenreFormModalProps {
  mode: GenreFormMode;
  genres: readonly AdminGenreListItem[];
  onClose: () => void;
}

interface FieldValues {
  name: string;
  parent: number;
}

// A Select option cannot carry null, so "no parent" is this id in the form.
const NO_PARENT = 0;

const TITLES = {
  create: 'Add genre',
  subgenre: 'Add subgenre',
  edit: 'Edit genre',
};

export const GenreFormModal: FC<GenreFormModalProps> = ({
  mode,
  genres,
  onClose,
}) => {
  const [form] = Form.useForm<FieldValues>();
  const create = useCreateGenre();
  const update = useUpdateGenre();
  const mutation = mode.kind === 'create' ? create : update;

  const original = {
    name: mode.kind === 'edit' ? mode.genre.name : '',
    parent:
      (mode.kind === 'edit' ? mode.genre.parentId : mode.parentId) ?? NO_PARENT,
  };
  const watched = Form.useWatch([], form) as FieldValues | undefined;
  const name = (watched?.name ?? original.name).trim();
  const parent = watched?.parent ?? original.parent;

  const updatePayload: GenreUpdatePayload = {
    ...(name !== original.name && { name }),
    ...(parent !== original.parent && {
      parentId: parent === NO_PARENT ? null : parent,
    }),
  };
  const isUnchanged =
    mode.kind === 'edit' && Object.keys(updatePayload).length === 0;

  const options = [
    { value: NO_PARENT, label: 'None (top level)' },
    ...parentChoices(
      buildGenreTree(genres),
      mode.kind === 'edit' ? mode.genre.id : undefined
    ).map(({ id, name: label }) => ({ value: id, label })),
  ];

  const handleSuccess = { onSuccess: onClose };

  const handleSubmit = () => {
    if (mode.kind === 'edit') {
      update.mutate(
        { id: mode.genre.id, payload: updatePayload },
        { ...handleSuccess, onError: showConflict }
      );
      return;
    }
    const payload: GenrePayload = {
      name,
      ...(parent !== NO_PARENT && { parentId: parent }),
    };
    create.mutate(payload, { ...handleSuccess, onError: showConflict });
  };

  function showConflict(error: Error) {
    if (error instanceof ApiError && error.status === 409) {
      form.setFields([{ name: 'name', errors: [error.message] }]);
    }
  }

  const failure = mutation.error;
  const showsAlert =
    failure !== null &&
    !(failure instanceof ApiError && failure.status === 409);

  return (
    <DiscardGuardModal
      title={
        mode.kind === 'edit'
          ? TITLES.edit
          : mode.parentId === null
            ? TITLES.create
            : TITLES.subgenre
      }
      form={form}
      onClose={onClose}
      footer={null}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={original}
        onFinish={handleSubmit}
      >
        <Form.Item
          name="name"
          label="Genre name"
          rules={[
            { required: true, whitespace: true, message: 'Enter a name' },
          ]}
        >
          <Input maxLength={GENRE_NAME_MAX_LENGTH} />
        </Form.Item>
        <Form.Item name="parent" label="Parent">
          <Select options={options} />
        </Form.Item>
        {showsAlert && (
          <Alert
            type="error"
            title={failure.message}
            style={{ marginBottom: 16 }}
          />
        )}
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={mutation.isPending}
            disabled={isUnchanged}
          >
            Save
          </Button>
        </Space>
      </Form>
    </DiscardGuardModal>
  );
};
