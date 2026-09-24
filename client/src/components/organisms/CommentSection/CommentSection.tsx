import { useState, type FC } from 'react';
import { Alert, Button, Empty, Input, Skeleton, Space, Typography } from 'antd';
import { Comment } from '@/components/molecules/Comment/Comment';
import { UnsavedTextNotice } from '@/components/molecules/UnsavedTextNotice/UnsavedTextNotice';
import { useSession } from '@/queries/auth';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from '@/queries/comments';
import { queryKeys } from '@/queries/keys';
import { useToggleLike } from '@/queries/likes';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  entriesOfBook,
  ownEntries,
  unsavedText,
  unsavedTextKeys,
} from '@/store/unsavedTextSlice';
import type { CommentWithAuthor } from '@/types/comment';
import styles from './CommentSection.module.css';

interface CommentSectionProps {
  bookId: number;
  // Read-only: the thread still shows, but nothing can be added to it or
  // changed in it. Set on a Draft book, which the server closes to new
  // comments and likes for everyone.
  closed?: boolean;
}

export const CommentSection: FC<CommentSectionProps> = ({
  bookId,
  closed = false,
}) => {
  const { data: session } = useSession();
  const { data, isPending, isError } = useComments(bookId);

  const create = useCreateComment(bookId);
  const update = useUpdateComment(bookId);
  const remove = useDeleteComment(bookId);
  const toggleLike = useToggleLike(queryKeys.comments(bookId));

  const dispatch = useAppDispatch();
  const entries = useAppSelector((state) => ownEntries(state, session?.id));

  // `replyTo` and `editing` are mutually exclusive by construction: opening one
  // closes the other, so there is never more than one composer on screen.
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  // The heading is rendered by both branches rather than only the loaded one,
  // so the section keeps its place on the page while the thread is in flight.
  const heading = <Typography.Title level={3}>Comments</Typography.Title>;

  if (isError) {
    return (
      <section>
        {heading}
        <Alert type="error" message="Could not load the comments." />
      </section>
    );
  }
  if (isPending) {
    return (
      <section>
        {heading}
        <Skeleton active paragraph={{ rows: 4 }} />
      </section>
    );
  }

  const all = data?.items ?? [];

  // The server returns a flat list; the two-level tree is assembled here, in
  // one pass over it. Only roots and their direct replies render, so a
  // tombstone earns its place only as a root keeping at least one live reply
  // in its thread. Every other tombstone — a reply, or a root whose replies
  // are all tombstones too — is noise, and is dropped here rather than on the
  // server: this is the only place that already knows what hangs off what.
  const liveReplies = new Map<number, CommentWithAuthor[]>();
  for (const item of all) {
    if (item.parentId === null || item.tombstone !== null) continue;
    const siblings = liveReplies.get(item.parentId) ?? [];
    siblings.push(item);
    liveReplies.set(item.parentId, siblings);
  }
  const roots = all.filter(
    (item) =>
      item.parentId === null &&
      (item.tombstone === null || liveReplies.has(item.id))
  );

  // A target missing from the list, or a Tombstone, is gone: its composer
  // cannot reopen, so its text is offered as a notice below instead.
  const isGone = (id: number): boolean => {
    const target = all.find((item) => item.id === id);
    return target === undefined || target.tombstone !== null;
  };
  const activeEdit = editing !== null && !isGone(editing) ? editing : null;
  const activeReply = replyTo !== null && !isGone(replyTo) ? replyTo : null;

  const composerKey =
    activeEdit !== null
      ? unsavedTextKeys.commentEdit(bookId, activeEdit)
      : activeReply !== null
        ? unsavedTextKeys.reply(bookId, activeReply)
        : unsavedTextKeys.comment(bookId);
  // An edit with no entry shows the Comment as saved; clearing it keeps an
  // empty entry, so the saved text does not come back.
  const savedText =
    activeEdit !== null
      ? (all.find((item) => item.id === activeEdit)?.text ?? '')
      : '';
  const draft = entries[composerKey]?.text ?? savedText;

  const orphans = session
    ? entriesOfBook(entries, bookId).filter(([key]) => {
        const [, , kind, id] = key.split(':');
        return (
          (kind === 'reply' || kind === 'commentEdit') && isGone(Number(id))
        );
      })
    : [];

  const submit = () => {
    const text = draft.trim();
    if (text.length === 0) return;

    const key = composerKey;
    // mutateAsync over mutate's per-call onSuccess: TanStack skips that
    // callback if the section unmounts before the mutation settles (the
    // reader navigating away right after Post), but mutateAsync's own
    // promise still settles, so the entry is still cleared instead of
    // resurfacing in the next composer that reads this key.
    const onFulfilled = () => {
      // Only once the server has the text: a failed send keeps it.
      dispatch(unsavedText.remove(key));
      setReplyTo(null);
      setEditing(null);
    };
    // Neither error is rendered anywhere in this section yet; this handler
    // exists only so the rejection is not left unhandled.
    const onRejected = () => {};

    if (activeEdit !== null) {
      void update
        .mutateAsync({ id: activeEdit, text })
        .then(onFulfilled, onRejected);
    } else {
      void create
        .mutateAsync({ bookId, parentId: activeReply, text })
        .then(onFulfilled, onRejected);
    }
  };

  const startEdit = (id: number) => {
    setEditing(id);
    setReplyTo(null);
  };

  const startReply = (id: number) => {
    setReplyTo(id);
    setEditing(null);
  };

  const deleteComment = (id: number) => {
    // mutateAsync over mutate's per-call onSuccess: see submit() above.
    void remove.mutateAsync(id).then(
      // The Account chose to delete it; its edit text is not worth offering.
      () =>
        dispatch(unsavedText.remove(unsavedTextKeys.commentEdit(bookId, id))),
      // Neither error is rendered anywhere in this section yet; this handler
      // exists only so the rejection is not left unhandled.
      () => {}
    );
  };

  const like = (comment: CommentWithAuthor) => {
    toggleLike.mutate({
      existingId: comment.viewerLikeId,
      payload: { commentId: comment.id, isLike: true },
    });
  };

  // A closed thread offers no action at all: every one of them either writes
  // through the composer or reacts, and neither is open on a draft.
  const canAct = Boolean(session) && !closed;

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
      onReply={startReply}
      onEdit={startEdit}
      onDelete={deleteComment}
      onLike={like}
    />
  );

  const composerLabel =
    activeEdit !== null
      ? 'Edit your comment'
      : activeReply !== null
        ? 'Write a reply'
        : 'Write a comment';

  return (
    <section>
      {heading}

      {roots.length === 0 && <Empty description="No comments yet." />}

      {roots.map((comment) => (
        <div key={comment.id}>
          {renderComment(comment, true)}
          <div className={styles.replies}>
            {(liveReplies.get(comment.id) ?? []).map((child) =>
              renderComment(child, false)
            )}
          </div>
        </div>
      ))}

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
      ) : session ? (
        <Space direction="vertical" className={styles.composer}>
          <Input.TextArea
            rows={3}
            value={draft}
            aria-label={composerLabel}
            onChange={(event) =>
              dispatch(
                unsavedText.upsert({
                  key: composerKey,
                  text: event.target.value,
                  saved: { text: savedText },
                })
              )
            }
          />
          <Button type="primary" onClick={submit}>
            {activeEdit !== null ? 'Save' : 'Post'}
          </Button>
        </Space>
      ) : (
        <Typography.Text type="secondary">
          Sign in to join the discussion.
        </Typography.Text>
      )}
    </section>
  );
};
