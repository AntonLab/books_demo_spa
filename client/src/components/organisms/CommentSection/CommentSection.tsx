import { useState, type FC, type ReactNode } from 'react';
import { Alert, App, Button, Empty, Flex, Skeleton, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Comment } from '@/components/molecules/Comment/Comment';
import { CommentComposerModal } from '@/components/molecules/CommentComposerModal/CommentComposerModal';
import { UnsavedTextNotice } from '@/components/molecules/UnsavedTextNotice/UnsavedTextNotice';
import { ReportCommentModal } from '@/components/molecules/ReportCommentModal/ReportCommentModal';
import { ApiError } from '@/api/client';
import { useSession } from '@/queries/auth';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useRestoreComment,
  useUpdateComment,
} from '@/queries/comments';
import { queryKeys } from '@/queries/keys';
import { useToggleLike } from '@/queries/likes';
import { useReportComment } from '@/queries/reports';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { useAppDispatch } from '@/store/hooks';
import {
  entriesOfBook,
  unsavedText,
  unsavedTextKeys,
} from '@/store/unsavedTextSlice';
import { useOwnUnsavedEntries } from '@/store/useUnsavedText';
import { isModeratorRole } from 'shared';
import type { CommentWithAuthor } from '@/types/api';
import styles from './CommentSection.module.css';

interface CommentSectionProps {
  bookId: number;
  // Read-only: the thread still shows, but nothing can be added to it or
  // changed in it. Set on a Draft book, which the server closes to new
  // comments and likes for everyone.
  closed?: boolean;
}

// What the one composer is writing: a new Comment, a reply to one, or an edit
// of one. One state for all three, so at most one composer is ever open.
type Composing =
  | { mode: 'comment' }
  | { mode: 'reply'; id: number }
  | { mode: 'edit'; id: number };

export const CommentSection: FC<CommentSectionProps> = ({
  bookId,
  closed = false,
}) => {
  const { data: session } = useSession();
  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useComments(bookId);

  const create = useCreateComment(bookId);
  const update = useUpdateComment(bookId);
  const remove = useDeleteComment(bookId);
  const restore = useRestoreComment(bookId);
  const toggleLike = useToggleLike(queryKeys.comments(bookId));

  const dispatch = useAppDispatch();
  const entries = useOwnUnsavedEntries();

  const report = useReportComment(bookId);
  // The rejection already shows through the mutation's error state; only it
  // is swallowed, so an error in `after` surfaces.
  const send = useSingleFlight(
    async (
      mutate: () => Promise<unknown>,
      after: () => Promise<void> | void
    ) => {
      try {
        await mutate();
      } catch {
        return;
      }
      await after();
    }
  );
  const sendReport = useSingleFlight((run: () => Promise<void>) => run());
  const { message } = App.useApp();

  const [composing, setComposing] = useState<Composing | null>(null);
  const [reporting, setReporting] = useState<number | null>(null);
  // Per-id state: `mutation.variables` keeps only the latest call, so a second
  // request would re-enable the first Comment early.
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());

  // Keyed by id, so one Comment's request never blocks another's. Remove is a
  // delete too: the server makes a Removed comment when another Account calls
  // it.
  const actOn = useSingleFlight(
    async (
      mutation: typeof remove,
      id: number,
      failure: string,
      onDone?: () => void
    ) => {
      setBusyIds((ids) => new Set(ids).add(id));
      try {
        try {
          await mutation.mutateAsync(id);
        } catch (error: unknown) {
          void message.error(
            error instanceof ApiError ? error.message : failure
          );
          return;
        }
        onDone?.();
      } finally {
        setBusyIds((ids) => {
          const next = new Set(ids);
          next.delete(id);
          return next;
        });
      }
    },
    (_mutation, id) => id
  );

  // The Book page's tab label names the region, so no heading here. Every
  // branch renders the row, so the section keeps its height while the thread
  // is in flight.
  const header = (action?: ReactNode) => (
    <Flex justify="flex-end" align="center" className={styles.header}>
      {action}
    </Flex>
  );

  // A failed next page keeps the data: the thread stays, the toast tells.
  if (isError && !isFetchNextPageError) {
    return (
      <section>
        {header()}
        <Alert type="error" title="Could not load the comments." />
      </section>
    );
  }
  if (isPending) {
    return (
      <section>
        {header()}
        <Skeleton active paragraph={{ rows: 4 }} />
      </section>
    );
  }

  const all = data?.pages.flatMap((page) => page.items) ?? [];

  // A closed thread offers no action at all: every one of them either writes
  // through the composer or reacts, and neither is open on a draft.
  const canAct = Boolean(session) && !closed;
  const moderating = canAct && isModeratorRole(session?.role);

  // The server returns a flat list; the two-level tree is built here. A
  // tombstone stays only as a root keeping at least one live reply; every
  // other one is dropped here rather than on the server, since only this
  // code knows what hangs off what. A Moderator keeps every Removed
  // tombstone, so Restore stays reachable.
  const shows = (item: CommentWithAuthor) =>
    item.tombstone === null || (moderating && item.tombstone === 'removed');
  const liveReplies = new Map<number, CommentWithAuthor[]>();
  for (const item of all) {
    if (item.parentId === null || !shows(item)) continue;
    const siblings = liveReplies.get(item.parentId) ?? [];
    siblings.push(item);
    liveReplies.set(item.parentId, siblings);
  }
  const roots = all.filter(
    (item) =>
      item.parentId === null && (shows(item) || liveReplies.has(item.id))
  );

  const find = (id: number) => all.find((item) => item.id === id);
  // A Tombstone is gone, and so is a target missing once every page is loaded:
  // its composer cannot reopen, so its text is offered as a notice below
  // instead. While a page is unloaded the target may sit on it, so it is not
  // gone yet.
  const isGone = (id: number): boolean => {
    const target = find(id);
    return target === undefined ? !hasNextPage : target.tombstone !== null;
  };

  // A reply or edit whose target went while it was open closes rather than
  // turning into a new Comment, and its text shows as a notice. Reset during
  // render, so a target restored later does not reopen it by surprise.
  if (composing && composing.mode !== 'comment' && isGone(composing.id)) {
    setComposing(null);
  }
  const target =
    composing && composing.mode !== 'comment' ? find(composing.id) : undefined;
  const editTarget = composing?.mode === 'edit' ? target : undefined;
  const replyTarget = composing?.mode === 'reply' ? target : undefined;

  const composerKey =
    editTarget !== undefined
      ? unsavedTextKeys.commentEdit(bookId, editTarget.id)
      : replyTarget !== undefined
        ? unsavedTextKeys.reply(bookId, replyTarget.id)
        : unsavedTextKeys.comment(bookId);
  // An edit with no entry shows the Comment as saved; clearing it keeps an
  // empty entry, so the saved text does not come back.
  const savedText = editTarget?.text ?? '';
  const draft = entries[composerKey]?.text ?? savedText;

  const orphans = session
    ? entriesOfBook(entries, bookId).filter(([key]) => {
        const [, , kind, id] = key.split(':');
        return (
          (kind === 'reply' || kind === 'commentEdit') && isGone(Number(id))
        );
      })
    : [];

  // Returns the result so a caller can tell a failed page from a loaded one.
  // cancelRefetch: false: a second call would cancel the page in flight and
  // resend it; this one joins the fetch already running, a refetch included.
  const loadMore = async () => {
    const result = await fetchNextPage({ cancelRefetch: false });
    if (result.isError) void message.error('Could not load more comments.');
    return result;
  };

  // After a create the new comment sits on the last page, so fetch every page
  // before it. The first call skips the hasNextPage gate: it is stale until the
  // refetch the create awaited lands. Never rejects: loadMore toasts a failure
  // and returns it.
  const loadRest = async () => {
    let result = await loadMore();
    while (result.hasNextPage && !result.isError) result = await loadMore();
  };

  const submit = () => {
    const text = draft.trim();
    if (text.length === 0) return;

    const key = composerKey;
    // mutateAsync, not mutate's per-call onSuccess, which TanStack skips if
    // the section unmounts first (navigating away right after Post): the
    // entry is cleared instead of resurfacing in the next composer.
    const onFulfilled = () => {
      // Only once the server has the text: a failed send keeps it.
      dispatch(unsavedText.remove(key));
      setComposing(null);
    };

    if (editTarget !== undefined) {
      void send(
        () => update.mutateAsync({ id: editTarget.id, text }),
        onFulfilled
      );
    } else {
      void send(
        () =>
          create.mutateAsync({
            bookId,
            // The thread stays two levels: a reply to a reply joins its root.
            parentId: replyTarget
              ? (replyTarget.parentId ?? replyTarget.id)
              : null,
            text,
          }),
        async () => {
          await loadRest();
          onFulfilled();
        }
      );
    }
  };

  // Each opening starts without the last send's failure.
  const open = (next: Composing) => {
    create.reset();
    update.reset();
    setComposing(next);
  };

  // A keyed single flight, not isPending: TanStack notifies it on a later tick,
  // so a double click would send two requests. mutateAsync as in submit()
  // above.
  const act = (
    mutation: typeof remove,
    id: number,
    failure: string,
    onDone?: () => void
  ) => void actOn(mutation, id, failure, onDone);

  const deleteComment = (id: number) =>
    act(remove, id, 'Could not delete the comment.', () =>
      // The Account chose to delete it; its edit text is not worth offering.
      dispatch(unsavedText.remove(unsavedTextKeys.commentEdit(bookId, id)))
    );

  const like = (comment: CommentWithAuthor) => {
    toggleLike.mutate({
      existingId: comment.viewerLikeId,
      payload: { commentId: comment.id, isLike: true },
    });
  };

  const removeComment = (id: number) =>
    act(remove, id, 'Could not remove the comment.');

  const restoreComment = (id: number) =>
    act(restore, id, 'Could not restore the comment.');

  const renderComment = (comment: CommentWithAuthor, canReply: boolean) => (
    <Comment
      key={comment.id}
      comment={comment}
      canReply={canReply && canAct}
      isOwn={canAct && session?.id === comment.userId}
      // Mirrors the server's rules: signed in, and not your own row. The server
      // refuses both cases with a 403 regardless — this only avoids offering
      // what would fail.
      canLike={canAct && session?.id !== comment.userId}
      onReply={(id) => open({ mode: 'reply', id })}
      onEdit={(id) => open({ mode: 'edit', id })}
      onDelete={deleteComment}
      onLike={like}
      canReport={canAct && session?.id !== comment.userId}
      onReport={(id) => {
        report.reset();
        setReporting(id);
      }}
      // The server's rule: a Moderator's own Comment gets Delete, not Remove.
      // A Tombstone has no userId, so it passes.
      canModerate={moderating && session?.id !== comment.userId}
      onRemove={removeComment}
      onRestore={restoreComment}
      busy={busyIds.has(comment.id)}
    />
  );

  const replyName = replyTarget?.author
    ? `${replyTarget.author.firstName} ${replyTarget.author.lastName}`
    : 'a comment';

  return (
    <section>
      {header(
        canAct && (
          <Button
            icon={<PlusOutlined aria-hidden />}
            onClick={() => open({ mode: 'comment' })}
          >
            Add comment
          </Button>
        )
      )}

      {roots.length === 0 && <Empty description="No comments yet." />}

      {roots.map((comment) => (
        <div key={comment.id}>
          {renderComment(comment, true)}
          <div className={styles.replies}>
            {/* The server refuses a reply under a Tombstone, and a reply to
                a reply is filed under its root. */}
            {(liveReplies.get(comment.id) ?? []).map((child) =>
              renderComment(child, comment.tombstone === null)
            )}
          </div>
        </div>
      ))}

      {hasNextPage && (
        <Flex justify="center" className={styles.more}>
          <Button loading={isFetchingNextPage} onClick={() => void loadMore()}>
            Load more comments
          </Button>
        </Flex>
      )}

      {orphans.map(([key, entry]) => (
        <UnsavedTextNotice
          key={key}
          text={entry.text}
          onDiscard={() => dispatch(unsavedText.remove(key))}
        />
      ))}

      {closed ? (
        <Typography.Text type="secondary">
          Comments are closed while this book is a draft.
        </Typography.Text>
      ) : (
        !session && (
          <Typography.Text type="secondary">
            Sign in to join the discussion.
          </Typography.Text>
        )
      )}

      {canAct && composing && (
        <CommentComposerModal
          title={
            editTarget
              ? 'Edit comment'
              : replyTarget
                ? `Reply to ${replyName}`
                : 'New comment'
          }
          label={
            editTarget
              ? 'Edit your comment'
              : replyTarget
                ? 'Write a reply'
                : 'Write a comment'
          }
          submitText={editTarget ? 'Save' : 'Post'}
          value={draft}
          onChange={(text) =>
            dispatch(
              unsavedText.upsert({
                key: composerKey,
                text,
                saved: { text: savedText },
              })
            )
          }
          onSubmit={submit}
          onCancel={() => setComposing(null)}
          pending={editTarget ? update.isPending : create.isPending}
          error={
            editTarget
              ? update.isError
                ? 'Could not save the comment.'
                : null
              : create.isError
                ? 'Could not post the comment.'
                : null
          }
          replyTo={replyTarget}
        />
      )}

      {canAct && reporting !== null && (
        <ReportCommentModal
          onSubmit={(payload) => {
            void sendReport(() =>
              report.mutateAsync({ commentId: reporting, payload }).then(
                () => setReporting(null),
                // The rejection already shows through report.error.
                () => {}
              )
            );
          }}
          onCancel={() => setReporting(null)}
          pending={report.isPending}
          error={
            !report.isError
              ? null
              : report.error instanceof ApiError && report.error.status === 409
                ? report.error.message
                : 'Could not send the report.'
          }
        />
      )}
    </section>
  );
};
