import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentSection } from './CommentSection';
import { ApiError } from '@/api/client';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as commentsApi from '@/api/comments';
import * as likesApi from '@/api/likes';
import type { CommentWithAuthor } from '@/types/comment';
import type { PublicUser } from '@/types/user';
import type { RootState } from '@/store';

jest.mock('@/api/comments');
jest.mock('@/api/likes');

const mockedComments = jest.mocked(commentsApi);
const mockedLikes = jest.mocked(likesApi);

const viewer: PublicUser = {
  id: 3,
  login: 'Reader',
  email: 'reader@example.com',
  firstName: 'Read',
  lastName: 'Er',
  status: 'active',
  role: 'user',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const root: CommentWithAuthor = {
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
  likeCount: 0,
  viewerLikeId: null,
};

const reply: CommentWithAuthor = {
  ...root,
  id: 6,
  parentId: 5,
  userId: 4,
  text: 'Agreed',
  author: {
    id: 4,
    login: 'Other',
    firstName: 'Oth',
    lastName: 'Er',
    avatarUrl: null,
  },
};

// Seeding the session through the query client is what makes the component
// think somebody is signed in; useSession reads this exact key.
const renderSignedIn = (preloadedState?: Partial<RootState>) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, viewer);
  return renderWithProviders(<CommentSection bookId={1} />, {
    queryClient,
    preloadedState,
  });
};

const savedAt = '2026-09-23T10:00:00.000Z';
const withEntries = (
  entries: Record<string, { text: string; savedAt: string }>
): Partial<RootState> => ({ unsavedText: { accountId: 3, entries } });

beforeEach(() => {
  jest.resetAllMocks();
  mockedComments.listComments.mockResolvedValue({
    items: [root, reply],
    total: 2,
    limit: 100,
    offset: 0,
  });
});

describe('CommentSection', () => {
  it('renders a comment and its reply', async () => {
    renderWithProviders(<CommentSection bookId={1} />);

    expect(await screen.findByText('A fine book')).toBeInTheDocument();
    expect(screen.getByText('Agreed')).toBeInTheDocument();
  });

  it('reports an empty thread', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
    });

    renderWithProviders(<CommentSection bookId={1} />);

    expect(await screen.findByText('No comments yet.')).toBeInTheDocument();
  });

  it('reports a failure', async () => {
    mockedComments.listComments.mockRejectedValue(new Error('nope'));

    renderWithProviders(<CommentSection bookId={1} />);

    expect(
      await screen.findByText('Could not load the comments.')
    ).toBeInTheDocument();
  });

  it('prompts an anonymous visitor to sign in instead of showing a composer', async () => {
    renderWithProviders(<CommentSection bookId={1} />);

    expect(
      await screen.findByText('Sign in to join the discussion.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('is read-only when closed, even for a signed-in visitor', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.session, viewer);
    renderWithProviders(<CommentSection bookId={1} closed />, { queryClient });

    expect(await screen.findByText('A fine book')).toBeInTheDocument();
    expect(
      screen.getByText('Comments are closed while this book is a draft.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('offers Reply only on the top-level comment', async () => {
    renderSignedIn();

    await screen.findByText('A fine book');

    // Two levels deep: the reply itself carries no Reply button.
    expect(screen.getAllByRole('button', { name: 'Reply' })).toHaveLength(1);
  });

  it('posts a top-level comment', async () => {
    mockedComments.createComment.mockResolvedValue({ ...root, id: 7 });

    renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.type(screen.getByRole('textbox'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    expect(mockedComments.createComment).toHaveBeenCalledWith({
      bookId: 1,
      parentId: null,
      text: 'New',
    });
  });

  it('posts a reply against the comment being replied to', async () => {
    mockedComments.createComment.mockResolvedValue({ ...root, id: 7 });

    renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.type(screen.getByRole('textbox'), 'Mine too');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    expect(mockedComments.createComment).toHaveBeenCalledWith({
      bookId: 1,
      parentId: 5,
      text: 'Mine too',
    });
  });

  it('loads the existing text into the composer when editing', async () => {
    renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('textbox')).toHaveValue('A fine book');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('patches the comment being edited', async () => {
    mockedComments.updateComment.mockResolvedValue({ ...root, text: 'Edited' });

    renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'Edited');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockedComments.updateComment).toHaveBeenCalledWith(5, 'Edited');
  });

  it('deletes your own comment', async () => {
    mockedComments.deleteComment.mockResolvedValue(undefined);

    renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockedComments.deleteComment).toHaveBeenCalledWith(5);
  });

  it('offers edit and delete only on your own comment', async () => {
    renderSignedIn();
    await screen.findByText('A fine book');

    // The reply belongs to user 4; the viewer is user 3.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });

  it('offers the like button only on another user comment', async () => {
    renderSignedIn();
    await screen.findByText('A fine book');

    // The server refuses a self-like with 403, so it is never offered.
    expect(screen.getAllByRole('button', { name: 'Like' })).toHaveLength(1);
  });

  it('drops a deleted comment that holds no replies', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [
        root,
        {
          ...reply,
          id: 8,
          parentId: null,
          text: '',
          tombstone: 'deleted',
          userId: null,
          author: null,
        },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    renderWithProviders(<CommentSection bookId={1} />);

    expect(await screen.findByText('A fine book')).toBeInTheDocument();
    expect(screen.queryByText('[deleted]')).toBeNull();
  });

  it('keeps a deleted comment that still holds a reply', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [
        { ...root, text: '', tombstone: 'deleted', userId: null, author: null },
        reply,
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    renderWithProviders(<CommentSection bookId={1} />);

    // The tombstone stays so the reply below it keeps its place in the thread.
    expect(await screen.findByText('[deleted]')).toBeInTheDocument();
    expect(screen.getByText('Agreed')).toBeInTheDocument();
  });

  it('drops a deleted reply', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [
        root,
        {
          ...reply,
          text: '',
          tombstone: 'deleted',
          userId: null,
          author: null,
        },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    renderWithProviders(<CommentSection bookId={1} />);

    expect(await screen.findByText('A fine book')).toBeInTheDocument();
    expect(screen.queryByText('[deleted]')).toBeNull();
  });

  it('drops a deleted comment whose only reply is deleted too', async () => {
    // Other replied to Reader, Other deleted the reply, then Reader deleted
    // the root.
    mockedComments.listComments.mockResolvedValue({
      items: [
        { ...root, text: '', tombstone: 'deleted', userId: null, author: null },
        {
          ...reply,
          text: '',
          tombstone: 'deleted',
          userId: null,
          author: null,
        },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    renderWithProviders(<CommentSection bookId={1} />);

    // Rendered only once the thread has loaded, whatever it holds.
    await screen.findByText('Sign in to join the discussion.');
    expect(screen.queryByText('[deleted]')).toBeNull();
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
  });

  it('drops a removed comment that holds no replies', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [
        root,
        {
          ...reply,
          id: 8,
          parentId: null,
          text: '',
          tombstone: 'removed',
          userId: null,
          author: null,
        },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    renderWithProviders(<CommentSection bookId={1} />);

    expect(await screen.findByText('A fine book')).toBeInTheDocument();
    expect(screen.queryByText('[removed by moderator]')).toBeNull();
  });

  it('keeps a removed comment that still holds a reply', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [
        { ...root, text: '', tombstone: 'removed', userId: null, author: null },
        reply,
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    renderWithProviders(<CommentSection bookId={1} />);

    expect(
      await screen.findByText('[removed by moderator]')
    ).toBeInTheDocument();
    expect(screen.getByText('Agreed')).toBeInTheDocument();
  });

  it('likes another user comment', async () => {
    mockedLikes.createLike.mockResolvedValue({
      id: 1,
      userId: 3,
      bookId: null,
      commentId: 6,
      isLike: true,
      createdAt: '2026-09-01T00:00:00.000Z',
    });

    renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getByRole('button', { name: 'Like' }));

    expect(mockedLikes.createLike).toHaveBeenCalledWith({
      commentId: 6,
      isLike: true,
    });
  });
});

describe('CommentSection Unsaved text', () => {
  it('restores the root composer after a remount', async () => {
    const { store, queryClient, unmount } = renderSignedIn();
    await screen.findByText('A fine book');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Write a comment' }),
      'Half a thought'
    );

    unmount();
    renderWithProviders(<CommentSection bookId={1} />, { store, queryClient });

    await screen.findByText('A fine book');
    expect(
      screen.getByRole('textbox', { name: 'Write a comment' })
    ).toHaveValue('Half a thought');
  });

  it('opens Edit on the Unsaved text rather than the saved comment', async () => {
    renderSignedIn(
      withEntries({
        'book:1:commentEdit:5': { text: 'Better wording', savedAt },
      })
    );
    await screen.findByText('A fine book');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('textbox')).toHaveValue('Better wording');
  });

  it('keeps the text when the post fails', async () => {
    mockedComments.createComment.mockRejectedValue(
      new ApiError(500, 'Server error')
    );
    const { store } = renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.type(screen.getByRole('textbox'), 'Keep me');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() =>
      expect(mockedComments.createComment).toHaveBeenCalled()
    );
    // Let the rejection settle, so a wrongly wired onSuccess would have run.
    await act(async () => {});

    expect(screen.getByRole('textbox')).toHaveValue('Keep me');
    expect(store.getState().unsavedText.entries['book:1:comment']?.text).toBe(
      'Keep me'
    );
  });

  it('clears the text once the post succeeds', async () => {
    mockedComments.createComment.mockResolvedValue({ ...root, id: 7 });
    const { store } = renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.type(screen.getByRole('textbox'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('offers the text of a reply whose comment became a Tombstone', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [
        { ...root, text: '', tombstone: 'deleted', userId: null, author: null },
        reply,
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });
    const { store } = renderSignedIn(
      withEntries({ 'book:1:reply:5': { text: 'Lost words', savedAt } })
    );

    expect(
      await screen.findByRole('textbox', { name: 'Unsaved text' })
    ).toHaveValue('Lost words');

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('clears the entry for a post that lands after the section unmounted', async () => {
    let land: (comment: CommentWithAuthor) => void = () => {};
    mockedComments.createComment.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = resolve;
        })
    );
    const { store, unmount } = renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.type(screen.getByRole('textbox'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() =>
      expect(mockedComments.createComment).toHaveBeenCalled()
    );
    unmount();
    // mutateAsync's promise settles whether or not the section that started
    // it is still mounted; mutate's per-call onSuccess would not fire here.
    await act(async () => land({ ...root, id: 7 }));

    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('drops the edit entry of a comment its owner deletes', async () => {
    mockedComments.deleteComment.mockResolvedValue(undefined);
    const { store } = renderSignedIn(
      withEntries({
        'book:1:commentEdit:5': { text: 'Better wording', savedAt },
      })
    );
    await screen.findByText('A fine book');

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(store.getState().unsavedText.entries).toEqual({})
    );
  });
});
