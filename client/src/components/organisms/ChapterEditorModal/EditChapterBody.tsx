import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import { Alert, Button, Divider, Popconfirm, Skeleton, Space } from 'antd';
import { UnsavedTextNotice } from '@/components/molecules/UnsavedTextNotice/UnsavedTextNotice';
import { ChapterForm } from '@/components/organisms/ChapterForm/ChapterForm';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { isBlank } from '@/store/unsavedTextSlice';
import spacing from '@/theme/spacing.module.css';
import { bookCapabilities } from '@/types/capabilities';
import { useChapterEdit } from './useChapterEdit';

interface EditChapterBodyProps {
  bookId: number;
  chapterId: number;
  onClose: () => void;
}

export const EditChapterBody: FC<EditChapterBodyProps> = ({
  bookId,
  chapterId,
  onClose,
}) => {
  const { data: session, isPending: sessionPending } = useSession();
  const book = useBook(bookId);
  // A save or delete can land after the modal is gone; without this, the
  // delayed onClose() would still fire.
  const mountedRef = useRef(true);
  useEffect(() => {
    // Set here too, not only at init: StrictMode runs the cleanup once between
    // two mounts, which would otherwise leave the modal never closing.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const closeIfMounted = () => {
    if (mountedRef.current) onClose();
  };
  const edit = useChapterEdit(bookId, chapterId, closeIfMounted);

  const { entry, discard } = edit.unsaved;
  const notice =
    session && entry && !isBlank(entry) ? (
      <UnsavedTextNotice
        title={entry.title}
        text={entry.text}
        onDiscard={discard}
      />
    ) : null;

  if (edit.status === 'error' || edit.status === 'gone' || book.isError) {
    return (
      <>
        <Alert
          type="error"
          title="Could not load this chapter."
          className={spacing.gapBelow}
        />
        {edit.status === 'gone' && notice}
      </>
    );
  }
  if (edit.status === 'pending' || book.isPending || sessionPending) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  if (!session || !bookCapabilities(book.data, session).mayEdit) {
    return (
      <>
        <Alert
          type="warning"
          title="You can no longer edit this chapter."
          className={spacing.gapBelow}
        />
        {notice}
      </>
    );
  }

  // Unreachable: narrows `edit` to 'ready'; TypeScript does not do it from the
  // `||`-combined checks above.
  if (edit.status !== 'ready') return null;

  const handleDelete = () => {
    void edit.remove().then(
      closeIfMounted,
      // The rejection already shows through removeState.error.
      () => {}
    );
  };

  return (
    <>
      {edit.conflict && (
        <Alert
          type="warning"
          title="A co-author changed this chapter since you started editing."
          action={
            <Space>
              <Button size="small" onClick={() => void edit.takeTheirs()}>
                Use their version
              </Button>
              <Button size="small" onClick={() => void edit.keepMine()}>
                Keep mine
              </Button>
            </Space>
          }
          className={spacing.gapBelow}
        />
      )}
      <ChapterForm
        key={edit.formKey}
        initialValues={edit.initialValues}
        publishedAt={edit.publishedAt}
        isSubmitting={edit.isSaving}
        error={edit.saveError}
        onValuesChange={edit.onValuesChange}
        onSubmit={edit.save}
      />

      <Divider />

      {edit.removeState.error && (
        <Alert
          type="error"
          title={edit.removeState.error.message}
          className={spacing.gapBelow}
        />
      )}
      <Popconfirm
        title="Delete this chapter?"
        okText="Delete"
        okButtonProps={{ danger: true }}
        onConfirm={handleDelete}
      >
        <Button danger loading={edit.removeState.isPending}>
          Delete chapter
        </Button>
      </Popconfirm>
    </>
  );
};
