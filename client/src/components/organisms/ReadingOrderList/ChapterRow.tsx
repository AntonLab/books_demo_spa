import { useState } from 'react';
import type { FC } from 'react';
import { App, Flex, Popconfirm, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import { useDeleteChapter } from '@/queries/chapters';
import { isBlank, unsavedTextKeys } from '@/store/unsavedTextSlice';
import { useUnsavedText } from '@/store/useUnsavedText';
import { formatDate } from '@/format/date';
import { chapterStateOf, type ChapterSummary } from '@/types/chapter';

interface ChapterRowProps {
  bookId: number;
  chapter: ChapterSummary;
  onEdit: () => void;
}

export const ChapterRow: FC<ChapterRowProps> = ({
  bookId,
  chapter,
  onEdit,
}) => {
  const { message } = App.useApp();
  const { entry, discard } = useUnsavedText(
    unsavedTextKeys.chapter(bookId, chapter.id)
  );
  const remove = useDeleteChapter(bookId, chapter.id);
  const [confirming, setConfirming] = useState(false);
  const state = chapterStateOf(chapter);

  return (
    <Flex justify="space-between" align="center" gap="small">
      <Space>
        <Typography.Text>{chapter.title}</Typography.Text>
        {state === 'draft' && <Tag>Draft</Tag>}
        {state === 'scheduled' && <Tag color="blue">Scheduled</Tag>}
        {entry && !isBlank(entry) && <Tag color="orange">Unsaved changes</Tag>}
      </Space>
      <Space>
        {chapter.publishedAt !== null && (
          <Typography.Text type="secondary">
            {formatDate(chapter.publishedAt)}
          </Typography.Text>
        )}
        <IconButton
          size="small"
          type="text"
          icon={<EditOutlined />}
          label={`Edit ${chapter.title}`}
          onClick={onEdit}
        />
        <Popconfirm
          title="Delete this chapter?"
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: discard,
              onError: (error) => void message.error(error.message),
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
            label={`Delete ${chapter.title}`}
          />
        </Popconfirm>
      </Space>
    </Flex>
  );
};
