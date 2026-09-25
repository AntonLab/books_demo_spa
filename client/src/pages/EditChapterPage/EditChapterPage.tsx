import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Divider,
  Popconfirm,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { UnsavedTextNotice } from '@/components/molecules/UnsavedTextNotice/UnsavedTextNotice';
import { ChapterForm } from '@/components/organisms/ChapterForm/ChapterForm';
import { useSession } from '@/queries/auth';
import { bookCapabilities } from '@/types/capabilities';
import { useBook } from '@/queries/books';
import { isBlank } from '@/store/unsavedTextSlice';
import spacing from '@/theme/spacing.module.css';
import styles from './EditChapterPage.module.css';
import { useChapterEdit } from './useChapterEdit';

export const EditChapterPage: FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const bookId = Number(params.bookId);
  const chapterId = Number(params.chapterId);

  const { data: session } = useSession();
  const book = useBook(bookId);
  const edit = useChapterEdit(bookId, chapterId);
  // A delete can land after the Account has already moved to an unrelated
  // route; without this, the delayed navigate() below would still fire and
  // pull them back here.
  const mountedRef = useRef(true);
  useEffect(() => {
    // Set here too, not only at init: StrictMode runs the cleanup once between
    // two mounts, which would otherwise leave the page never navigating.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
  if (edit.status === 'pending' || book.isPending) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  if (!bookCapabilities(book.data, session).mayEdit) {
    return (
      <>
        <Alert
          type="warning"
          title="Only its co-authors can edit this chapter."
          className={spacing.gapBelow}
        />
        {notice}
      </>
    );
  }

  // Unreachable: the two guards above already excluded 'pending', 'error'
  // and 'gone'. TypeScript does not eliminate a union member whose
  // discriminant is itself a multi-value literal type from `||`-combined
  // equality checks over several statements, so this is what makes it
  // narrow `edit` to 'ready' for the rest of the component.
  if (edit.status !== 'ready') return null;

  const handleDelete = () => {
    void edit.remove().then(
      () => {
        // Only while still here: the Account may have already moved to an
        // unrelated route, and forcing them back here now would be jarring.
        if (mountedRef.current) void navigate(`/books/${bookId}/edit`);
      },
      // A rejection is already surfaced through removeState.error; this
      // handler exists only so the rejection is not left unhandled.
      () => {}
    );
  };

  return (
    <>
      <Typography.Title level={2}>Edit chapter</Typography.Title>
      <Link to={`/books/${bookId}/edit`}>{`Back to ${book.data.title}`}</Link>

      <div className={styles.body}>
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
        {edit.saved && (
          <Alert type="success" title="Saved." className={spacing.gapBelow} />
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
      </div>

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
