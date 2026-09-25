import { useEffect, useRef, useState } from 'react';
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
import { ApiError } from '@/api/client';
import { UnsavedTextNotice } from '@/components/molecules/UnsavedTextNotice/UnsavedTextNotice';
import { ChapterForm } from '@/components/organisms/ChapterForm/ChapterForm';
import type { ChapterFormValues } from '@/components/organisms/ChapterForm/ChapterForm';
import { useSession } from '@/queries/auth';
import { bookCapabilities } from '@/types/capabilities';
import { useBook } from '@/queries/books';
import {
  useChapter,
  useDeleteChapter,
  useUpdateChapter,
} from '@/queries/chapters';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  isBlank,
  ownEntries,
  unsavedText,
  unsavedTextKeys,
} from '@/store/unsavedTextSlice';
import spacing from '@/theme/spacing.module.css';
import styles from './EditChapterPage.module.css';

export const EditChapterPage: FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const params = useParams();
  const bookId = Number(params.bookId);
  const chapterId = Number(params.chapterId);
  const unsavedKey = unsavedTextKeys.chapter(bookId, chapterId);

  const { data: session } = useSession();
  const book = useBook(bookId);
  const chapter = useChapter(chapterId);
  const update = useUpdateChapter(bookId, chapterId);
  const remove = useDeleteChapter(bookId, chapterId);
  const entry = useAppSelector(
    (state) => ownEntries(state, session?.id)[unsavedKey]
  );
  // Bumped by "Use their version" to remount the form even when the version
  // on screen has not changed, so it lets go of the discarded text.
  const [resets, setResets] = useState(0);
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

  const discardEntry = () => {
    dispatch(unsavedText.remove(unsavedKey));
  };
  const notice =
    session && entry && !isBlank(entry) ? (
      <UnsavedTextNotice
        title={entry.title}
        text={entry.text}
        onDiscard={discardEntry}
      />
    ) : null;

  if (chapter.isError || book.isError) {
    const gone =
      chapter.error instanceof ApiError && chapter.error.status === 404;
    return (
      <>
        <Alert
          type="error"
          title="Could not load this chapter."
          className={spacing.gapBelow}
        />
        {gone && notice}
      </>
    );
  }
  if (chapter.isPending || book.isPending) {
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

  const saveRefused =
    update.error instanceof ApiError && update.error.status === 409;
  // The server serialises every `updatedAt` as an ISO string of one format,
  // so string order is time order.
  const newest = (a: string, b: string | undefined) =>
    b !== undefined && b > a ? b : a;
  // Right after a save lands, `chapter.data` is still the version before it
  // until the refetch arrives; the save's own answer is the newer one.
  const latestUpdatedAt = newest(
    chapter.data.updatedAt,
    update.data?.updatedAt
  );
  // Shown before any save too: after a reload the refetched chapter can be
  // newer than the version the Unsaved text was typed against. A base newer
  // than `chapter.data` is the Account's own save awaiting the refetch.
  const conflict =
    saveRefused ||
    (entry?.baseUpdatedAt !== undefined &&
      chapter.data.updatedAt > entry.baseUpdatedAt);
  // The version the typing started from. Sending the refetched `updatedAt`
  // instead would let a save after a reload overwrite a Co-author's newer
  // version with no 409.
  const baseUpdatedAt = entry?.baseUpdatedAt ?? latestUpdatedAt;

  const latest =
    update.data && update.data.updatedAt === latestUpdatedAt
      ? update.data
      : chapter.data;

  const handleValuesChange = (values: { title: string; text: string }) => {
    dispatch(
      unsavedText.upsert({
        key: unsavedKey,
        ...values,
        baseUpdatedAt,
        saved: { title: latest.title, text: latest.text },
      })
    );
  };

  const handleSubmit = (values: ChapterFormValues) => {
    // mutateAsync over mutate's per-call onSuccess: TanStack skips that
    // callback if the page unmounts before the mutation settles (a click on
    // "Back to …" right after Save), but mutateAsync's own promise still
    // settles, so the entry is still cleared or rebased.
    void update
      .mutateAsync({ ...values, expectedUpdatedAt: baseUpdatedAt })
      .then(
        (saved) =>
          // Not a plain remove: text typed while the save was in flight
          // stays, rebased onto the version this save created.
          dispatch(
            unsavedText.saved({
              key: unsavedKey,
              title: values.title,
              text: values.text,
              updatedAt: saved.updatedAt,
            })
          ),
        // A rejection is already surfaced through update.error; this handler
        // exists only so the rejection is not left unhandled.
        () => {}
      );
  };

  const takeTheirs = async () => {
    update.reset();
    discardEntry();
    setResets((count) => count + 1);
    await chapter.refetch();
  };

  // The next Save is then a deliberate overwrite of their version.
  const keepMine = async () => {
    update.reset();
    const { data } = await chapter.refetch();
    if (data) {
      dispatch(
        unsavedText.rebase({ key: unsavedKey, baseUpdatedAt: data.updatedAt })
      );
    }
  };

  const handleDelete = () => {
    // mutateAsync over mutate's per-call onSuccess: TanStack skips that
    // callback if the page unmounts before the mutation settles (the
    // Account navigating away, not Popconfirm closing, is what unmounts
    // it), but mutateAsync's own promise still settles, so the entry is
    // still discarded.
    void remove.mutateAsync(undefined).then(
      () => {
        discardEntry();
        // Only while still here: the Account may have already moved to an
        // unrelated route, and forcing them back here now would be jarring.
        if (mountedRef.current) void navigate(`/books/${bookId}/edit`);
      },
      // A rejection is already surfaced through remove.error; this handler
      // exists only so the rejection is not left unhandled.
      () => {}
    );
  };

  return (
    <>
      <Typography.Title level={2}>Edit chapter</Typography.Title>
      <Link to={`/books/${bookId}/edit`}>{`Back to ${book.data.title}`}</Link>

      <div className={styles.body}>
        {conflict && (
          <Alert
            type="warning"
            title="A co-author changed this chapter since you started editing."
            action={
              <Space>
                <Button size="small" onClick={() => void takeTheirs()}>
                  Use their version
                </Button>
                <Button size="small" onClick={() => void keepMine()}>
                  Keep mine
                </Button>
              </Space>
            }
            className={spacing.gapBelow}
          />
        )}
        {update.isSuccess && (
          <Alert type="success" title="Saved." className={spacing.gapBelow} />
        )}
        <ChapterForm
          // Remounts on each new server version and on "Use their version".
          // It seeds from the Unsaved text when there is one, so a remount
          // never loses what was typed.
          key={`${chapter.data.updatedAt}#${resets}`}
          initialValues={
            entry
              ? { title: entry.title ?? '', text: entry.text }
              : { title: chapter.data.title, text: chapter.data.text }
          }
          publishedAt={chapter.data.publishedAt}
          isSubmitting={update.isPending}
          error={saveRefused ? null : (update.error?.message ?? null)}
          onValuesChange={handleValuesChange}
          onSubmit={handleSubmit}
        />
      </div>

      <Divider />

      {remove.error && (
        <Alert
          type="error"
          title={remove.error.message}
          className={spacing.gapBelow}
        />
      )}
      <Popconfirm
        title="Delete this chapter?"
        okText="Delete"
        okButtonProps={{ danger: true }}
        onConfirm={handleDelete}
      >
        <Button danger loading={remove.isPending}>
          Delete chapter
        </Button>
      </Popconfirm>
    </>
  );
};
