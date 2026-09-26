import { useRef, type FC } from 'react';
import { Alert, Input, Modal, type GetRef } from 'antd';
import { Comment } from '@/components/molecules/Comment/Comment';
import type { CommentWithAuthor } from '@/types/api';
import spacing from '@/theme/spacing.module.css';
import styles from './CommentComposerModal.module.css';

interface CommentComposerModalProps {
  title: string;
  // The textarea's accessible name.
  label: string;
  submitText: string;
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  // Shown above the field while the last send's failure stands.
  error: string | null;
  // The Comment being replied to, shown read-only above the field.
  replyTo?: CommentWithAuthor;
}

const noop = () => {};

// Mounted only while open, like the auth modals, so each opening starts fresh.
// Its text lives in the caller's Unsaved text entry, never here: closing
// discards nothing.
export const CommentComposerModal: FC<CommentComposerModalProps> = ({
  title,
  label,
  submitText,
  value,
  onChange,
  onSubmit,
  onCancel,
  pending,
  error,
  replyTo,
}) => {
  const field = useRef<GetRef<typeof Input.TextArea>>(null);

  return (
    <Modal
      open
      title={title}
      okText={submitText}
      onOk={onSubmit}
      onCancel={onCancel}
      confirmLoading={pending}
      okButtonProps={{ disabled: value.trim() === '' }}
      // Once the dialog is in place, with the caret after any restored
      // Unsaved text so typing continues it.
      afterOpenChange={(opened) => {
        if (opened) field.current?.focus({ cursor: 'end' });
      }}
    >
      {replyTo && (
        <div className={styles.quote}>
          <Comment
            comment={replyTo}
            canReply={false}
            clamp={false}
            isOwn={false}
            canLike={false}
            onReply={noop}
            onEdit={noop}
            onDelete={noop}
            onLike={noop}
          />
        </div>
      )}

      {error !== null && (
        <Alert type="error" title={error} className={spacing.gapBelow} />
      )}

      <Input.TextArea
        ref={field}
        rows={4}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </Modal>
  );
};
