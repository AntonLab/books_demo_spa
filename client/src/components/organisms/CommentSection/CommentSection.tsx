import { useState, type FC } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  Skeleton,
  Space,
  theme,
  Typography,
} from 'antd';
import { Comment } from '@/components/molecules/Comment';
import { useSession } from '@/queries/auth';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from '@/queries/comments';
import { queryKeys } from '@/queries/keys';
import { useToggleLike } from '@/queries/likes';
import type { CommentWithAuthor } from '@/types/comment';

interface CommentSectionProps {
  bookId: number;
}

export const CommentSection: FC<CommentSectionProps> = ({ bookId }) => {
  const { token } = theme.useToken();
  const { data: session } = useSession();
  const { data, isPending, isError } = useComments(bookId);

  const create = useCreateComment(bookId);
  const update = useUpdateComment(bookId);
  const remove = useDeleteComment(bookId);
  const toggleLike = useToggleLike(queryKeys.comments(bookId));

  // `replyTo` and `editing` are mutually exclusive by construction: opening one
  // closes the other, so there is never more than one composer on screen.
  const [draft, setDraft] = useState('');
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
  // The server returns a flat list; the two-level tree is assembled here.
  const repliesOf = (id: number) => all.filter((item) => item.parentId === id);

  // A tombstone earns its place only by holding replies together. One with
  // nothing under it is pure noise, so it is dropped here rather than on the
  // server — the tree is assembled in this component, so this is the only place
  // that already knows whether a comment has children.
  const visible = all.filter(
    (item) => !item.isDeleted || repliesOf(item.id).length > 0
  );
  const roots = visible.filter((item) => item.parentId === null);

  const submit = () => {
    const text = draft.trim();
    if (text.length === 0) return;

    if (editing !== null) {
      update.mutate({ id: editing, text });
    } else {
      create.mutate({ bookId, parentId: replyTo, text });
    }

    setDraft('');
    setReplyTo(null);
    setEditing(null);
  };

  const startEdit = (id: number) => {
    setEditing(id);
    setReplyTo(null);
    setDraft(all.find((item) => item.id === id)?.text ?? '');
  };

  const startReply = (id: number) => {
    setReplyTo(id);
    setEditing(null);
    setDraft('');
  };

  const like = (comment: CommentWithAuthor) => {
    toggleLike.mutate({
      existingId: comment.viewerLikeId,
      payload: { commentId: comment.id, isLike: true },
    });
  };

  const renderComment = (comment: CommentWithAuthor, canReply: boolean) => (
    <Comment
      key={comment.id}
      comment={comment}
      canReply={canReply && Boolean(session)}
      isOwn={session?.id === comment.userId}
      // Mirrors the server's rules: signed in, and not your own row. The server
      // refuses both cases with a 403 regardless — this only avoids offering
      // what would fail.
      canLike={Boolean(session) && session?.id !== comment.userId}
      onReply={startReply}
      onEdit={startEdit}
      onDelete={(id) => remove.mutate(id)}
      onLike={like}
    />
  );

  const composerLabel =
    editing !== null
      ? 'Edit your comment'
      : replyTo !== null
        ? 'Write a reply'
        : 'Write a comment';

  return (
    <section>
      {heading}

      {roots.length === 0 && <Empty description="No comments yet." />}

      {roots.map((comment) => (
        <div key={comment.id}>
          {renderComment(comment, true)}
          <div style={{ marginLeft: token.marginXL }}>
            {/* `visible`, not `repliesOf`: a deleted reply holds nothing
                together, so it is dropped like any other tombstone leaf. */}
            {visible
              .filter((item) => item.parentId === comment.id)
              .map((child) => renderComment(child, false))}
          </div>
        </div>
      ))}

      {session ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input.TextArea
            rows={3}
            value={draft}
            aria-label={composerLabel}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="primary" onClick={submit}>
            {editing !== null ? 'Save' : 'Post'}
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
