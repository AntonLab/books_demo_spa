import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Comment } from './Comment';
import { formatDate } from '@/format/date';
import type { CommentWithAuthor } from '@/types/comment';

const comment: CommentWithAuthor = {
  id: 5,
  parentId: null,
  userId: 3,
  bookId: 1,
  text: 'A fine chapter',
  tombstone: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  author: {
    id: 3,
    login: 'Reader',
    firstName: 'Read',
    lastName: 'Er',
    avatarUrl: null,
  },
  likeCount: 2,
  viewerLikeId: null,
};

const baseProps = {
  comment,
  canReply: true,
  isOwn: false,
  canLike: true,
  onReply: jest.fn(),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onLike: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Comment', () => {
  it('renders the author and the text', () => {
    render(<Comment {...baseProps} />);

    expect(screen.getByText('Read Er')).toBeInTheDocument();
    expect(screen.getByText('A fine chapter')).toBeInTheDocument();
  });

  it('dates the comment with the app date helper', () => {
    render(<Comment {...baseProps} />);

    expect(screen.getByText(formatDate(comment.createdAt))).toBeInTheDocument();
  });

  it('hides edit and delete on another user comment', () => {
    render(<Comment {...baseProps} />);

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('offers edit on your own comment', async () => {
    const onEdit = jest.fn();
    render(<Comment {...baseProps} isOwn onEdit={onEdit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(5);
  });

  it('offers delete on your own comment', async () => {
    const onDelete = jest.fn();
    render(<Comment {...baseProps} isOwn onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(5);
  });

  it('hides the like button when liking is not allowed', () => {
    // The server refuses a self-like with 403; the UI just does not offer it.
    render(<Comment {...baseProps} isOwn canLike={false} />);

    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
  });

  it('shows the like count when liking is allowed', () => {
    render(<Comment {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Like' })).toHaveTextContent('2');
  });

  it('reports a like request with the whole comment', async () => {
    const onLike = jest.fn();
    render(<Comment {...baseProps} onLike={onLike} />);

    await userEvent.click(screen.getByRole('button', { name: 'Like' }));

    expect(onLike).toHaveBeenCalledWith(comment);
  });

  it('shows the author’s avatar picture when they have one', () => {
    // Not screen.getByRole('img'): the avatar is aria-hidden (Task 14's
    // ruling), so a container query by src is the unambiguous way to reach it.
    const { container } = render(
      <Comment
        {...baseProps}
        comment={{
          ...comment,
          author: { ...comment.author!, avatarUrl: '/api/users/3/avatar?v=1' },
        }}
      />
    );

    expect(
      container.querySelector('img[src="/api/users/3/avatar?v=1"]')
    ).toBeInTheDocument();
  });

  it('falls back to an initial when the author has no avatar', () => {
    render(<Comment {...baseProps} />);

    // Read Er's initial — the fixture author has no avatarUrl.
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('shows no avatar at all for a tombstone', () => {
    const { container } = render(
      <Comment
        {...baseProps}
        comment={{
          ...comment,
          tombstone: 'deleted',
          author: null,
          text: '',
          userId: null,
        }}
      />
    );

    // Neither an <img> nor antd's fallback-initial Avatar should exist at all.
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.ant-avatar')).toBeNull();
  });

  it('hides the reply button on a reply', () => {
    // The UI is two levels deep, so a reply carries no Reply button of its own.
    render(<Comment {...baseProps} canReply={false} />);

    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
  });

  it('reports a reply request', async () => {
    const onReply = jest.fn();
    render(<Comment {...baseProps} onReply={onReply} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(onReply).toHaveBeenCalledWith(5);
  });

  describe('a deleted comment', () => {
    const deleted: CommentWithAuthor = {
      ...comment,
      tombstone: 'deleted',
      text: '',
      userId: null,
      author: null,
    };

    it('renders a tombstone instead of the author and text', () => {
      render(<Comment {...baseProps} comment={deleted} isOwn />);

      expect(screen.getByText('[deleted]')).toBeInTheDocument();
      expect(screen.queryByText('Read Er')).toBeNull();
    });

    it('offers no controls at all, even to its own author', () => {
      // isOwn and canLike are both on: it is the tombstone, not the props,
      // that must suppress them.
      render(<Comment {...baseProps} comment={deleted} isOwn />);

      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  it('renders a removed comment as [removed by moderator], with no author or controls', () => {
    render(
      <Comment
        {...baseProps}
        isOwn
        comment={{
          ...baseProps.comment,
          tombstone: 'removed',
          text: '',
          userId: null,
          author: null,
        }}
      />
    );

    expect(screen.getByText('[removed by moderator]')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
