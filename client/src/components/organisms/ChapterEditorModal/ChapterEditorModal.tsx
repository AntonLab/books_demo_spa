import type { FC } from 'react';
import { Modal } from 'antd';
import { EditChapterBody } from './EditChapterBody';
import { NewChapterBody } from './NewChapterBody';

interface ChapterEditorModalProps {
  bookId: number;
  // null starts a new Chapter.
  chapterId: number | null;
  onClose: () => void;
}

// Not a DiscardGuardModal: what is typed is kept as Unsaved text, so closing
// never asks to confirm.
export const ChapterEditorModal: FC<ChapterEditorModalProps> = ({
  bookId,
  chapterId,
  onClose,
}) => (
  <Modal
    open
    width="90vw"
    footer={null}
    title={chapterId === null ? 'New chapter' : 'Edit chapter'}
    onCancel={onClose}
  >
    {chapterId === null ? (
      <NewChapterBody bookId={bookId} onClose={onClose} />
    ) : (
      <EditChapterBody
        bookId={bookId}
        chapterId={chapterId}
        onClose={onClose}
      />
    )}
  </Modal>
);
