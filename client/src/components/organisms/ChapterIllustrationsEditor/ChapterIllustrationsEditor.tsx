import { useState } from 'react';
import type { FC } from 'react';
import { Alert, Flex, Input, Popconfirm, Skeleton, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  ILLUSTRATION_CAPTION_MAX_LENGTH,
  ILLUSTRATIONS_PER_CHAPTER_MAX,
} from 'shared';
import { ApiError } from '@/api/client';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import { ImageUploadButton } from '@/components/molecules/ImageUploadButton/ImageUploadButton';
import {
  useDeleteIllustration,
  useIllustrations,
  useReorderIllustrations,
  useUpdateIllustrationCaption,
  useUploadIllustration,
} from '@/queries/illustrations';
import spacing from '@/theme/spacing.module.css';
import {
  illustrationImageUrl,
  type PublicIllustration,
} from '@/types/illustration';
import styles from './ChapterIllustrationsEditor.module.css';

interface IllustrationRowProps {
  item: PublicIllustration;
  number: number;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onSaveCaption: (caption: string | null) => void;
  onMove: (offset: -1 | 1) => void;
  onDelete: () => void;
}

// Keyed by id and updatedAt by the list, so the draft resets once a save lands.
const IllustrationRow: FC<IllustrationRowProps> = ({
  item,
  number,
  isFirst,
  isLast,
  disabled,
  onSaveCaption,
  onMove,
  onDelete,
}) => {
  const [draft, setDraft] = useState(item.caption ?? '');

  return (
    <li className={styles.row}>
      <img
        className={styles.thumbnail}
        src={illustrationImageUrl(item)}
        alt={`Illustration ${number}`}
      />
      <Input
        aria-label={`Caption of illustration ${number}`}
        maxLength={ILLUSTRATION_CAPTION_MAX_LENGTH}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <IconButton
        label={`Save caption of illustration ${number}`}
        icon={<SaveOutlined />}
        disabled={disabled || draft.trim() === (item.caption ?? '')}
        onClick={() => onSaveCaption(draft.trim() || null)}
      />
      <IconButton
        label={`Move illustration ${number} up`}
        icon={<ArrowUpOutlined />}
        disabled={disabled || isFirst}
        onClick={() => onMove(-1)}
      />
      <IconButton
        label={`Move illustration ${number} down`}
        icon={<ArrowDownOutlined />}
        disabled={disabled || isLast}
        onClick={() => onMove(1)}
      />
      <Popconfirm
        title="Delete this illustration?"
        okText="Delete"
        okButtonProps={{ danger: true }}
        onConfirm={onDelete}
      >
        <IconButton
          danger
          label={`Delete illustration ${number}`}
          icon={<DeleteOutlined />}
          disabled={disabled}
        />
      </Popconfirm>
    </li>
  );
};

// Writes through the Illustrations' own endpoints, never the chapter form's save.
export const ChapterIllustrationsEditor: FC<{ chapterId: number }> = ({
  chapterId,
}) => {
  const illustrations = useIllustrations(chapterId);
  const upload = useUploadIllustration(chapterId);
  const caption = useUpdateIllustrationCaption(chapterId);
  const remove = useDeleteIllustration(chapterId);
  const reorder = useReorderIllustrations(chapterId);
  const [error, setError] = useState<string | null>(null);

  if (illustrations.isPending)
    return <Skeleton active paragraph={{ rows: 2 }} />;
  if (illustrations.isError) {
    return <Alert type="error" title="Could not load the illustrations." />;
  }

  const items = illustrations.data.items;
  const onError = (failure: Error) => setError(failure.message);

  const move = (index: number, offset: -1 | 1) => {
    setError(null);
    const ids = items.map((item) => item.id);
    ids.splice(index + offset, 0, ...ids.splice(index, 1));
    reorder.mutate(ids, {
      onError: (failure) =>
        setError(
          failure instanceof ApiError && failure.status === 409
            ? 'The illustrations changed since you loaded them. The list was reloaded.'
            : failure.message
        ),
    });
  };

  return (
    <section>
      <Typography.Title level={4}>Illustrations</Typography.Title>
      <Typography.Paragraph type="secondary">
        {items.length} of {ILLUSTRATIONS_PER_CHAPTER_MAX}
      </Typography.Paragraph>
      {error && (
        <Alert type="error" title={error} className={spacing.gapBelow} />
      )}
      {items.length >= ILLUSTRATIONS_PER_CHAPTER_MAX ? (
        <Typography.Text type="secondary">
          This chapter holds the most illustrations it can (
          {ILLUSTRATIONS_PER_CHAPTER_MAX}).
        </Typography.Text>
      ) : (
        <ImageUploadButton
          label="Add illustration"
          loading={upload.isPending}
          onFile={(file) => {
            setError(null);
            upload.mutate(file, { onError });
          }}
          onReject={setError}
        />
      )}
      <Flex component="ol" vertical className={styles.list}>
        {items.map((item, index) => (
          <IllustrationRow
            key={`${item.id}:${item.updatedAt}`}
            item={item}
            number={index + 1}
            isFirst={index === 0}
            isLast={index === items.length - 1}
            disabled={reorder.isPending}
            onSaveCaption={(value) => {
              setError(null);
              caption.mutate({ id: item.id, caption: value }, { onError });
            }}
            onMove={(offset) => move(index, offset)}
            onDelete={() => {
              setError(null);
              remove.mutate(item.id, { onError });
            }}
          />
        ))}
      </Flex>
    </section>
  );
};
