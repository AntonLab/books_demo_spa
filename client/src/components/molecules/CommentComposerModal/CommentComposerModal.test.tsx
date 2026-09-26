import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentComposerModal } from './CommentComposerModal';
import type { CommentWithAuthor } from '@/types/api';

const target: CommentWithAuthor = {
  id: 5,
  parentId: null,
  userId: 3,
  bookId: 1,
  text: 'A fine book',
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

const renderModal = (
  props: Partial<Parameters<typeof CommentComposerModal>[0]> = {}
) => {
  const handlers = {
    onChange: jest.fn(),
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
  };
  render(
    <CommentComposerModal
      title="New comment"
      label="Write a comment"
      submitText="Post"
      value="Hello"
      pending={false}
      error={null}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('CommentComposerModal', () => {
  it('renders the field with its value under the title', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'New comment' });
    expect(
      within(dialog).getByRole('textbox', { name: 'Write a comment' })
    ).toHaveValue('Hello');
  });

  it('reports typing, submit and cancel', async () => {
    const { onChange, onSubmit, onCancel } = renderModal();

    await userEvent.type(screen.getByRole('textbox'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onChange).toHaveBeenCalledWith('Hello!');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables submit for blank text', () => {
    renderModal({ value: '  ' });

    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('shows the error', () => {
    renderModal({ error: 'Could not post the comment.' });

    expect(screen.getByText('Could not post the comment.')).toBeInTheDocument();
  });

  it('shows the replied-to comment without its controls', () => {
    renderModal({ replyTo: target });

    expect(screen.getByText('A fine book')).toBeInTheDocument();
    expect(screen.getByText('Read Er')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Like' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
  });
});
