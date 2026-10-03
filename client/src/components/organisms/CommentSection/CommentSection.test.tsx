import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentSection } from './CommentSection';
import { ApiError } from '@/api/client';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as commentsApi from '@/api/comments';
import * as likesApi from '@/api/likes';
import * as reportsApi from '@/api/reports';
import type { CommentWithAuthor, PublicUser } from '@/types/api';
import type { RootState } from '@/store';

jest.mock('@/api/comments');
jest.mock('@/api/likes');
jest.mock('@/api/reports');

const mockedComments = jest.mocked(commentsApi);
const mockedLikes = jest.mocked(likesApi);
const mockedReports = jest.mocked(reportsApi);

const viewer: PublicUser = {
  id: 3,
  login: 'Reader',
  email: 'reader@example.com',
  firstName: 'Read',
  lastName: 'Er',
  status: 'active',
  role: 'user',
  avatarUrl: null,
  about: '',
  showLastSeen: true,
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
  hasOpenReport: false,
  viewerReportedId: null,
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

const renderAs = (role: PublicUser['role'] | 'guest') => {
  const queryClient = createTestQueryClient();
  if (role !== 'guest') {
    queryClient.setQueryData(queryKeys.session, { ...viewer, role });
  }
  return renderWithProviders(<CommentSection bookId={1} />, { queryClient });
};

const addComment = () =>
  userEvent.click(screen.getByRole('button', { name: 'Add comment' }));

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

  it.each([
    ['user', 0],
    ['author', 0],
    ['admin', 1],
    ['superadmin', 1],
    ['guest', 0],
  ] as const)(
    'a %s sees %i Remove button, never on their own comment',
    async (role, count) => {
      renderAs(role);
      await screen.findByText('Agreed');

      expect(screen.queryAllByRole('button', { name: 'Remove' })).toHaveLength(
        count
      );
    }
  );

  it('Remove asks first, then calls DELETE for the comment and refetches the thread, the book and the reports', async () => {
    mockedComments.deleteComment.mockResolvedValue(undefined);
    const { queryClient } = renderAs('admin');
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    await screen.findByText('Agreed');

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Yes, remove' })
    );

    await waitFor(() =>
      expect(mockedComments.deleteComment).toHaveBeenCalledWith(6)
    );
    await waitFor(() =>
      expect(mockedComments.listComments).toHaveBeenCalledTimes(2)
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.allReports });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.book(1) });
  });

  it.each([
    ['admin', 'removed', 1],
    ['superadmin', 'removed', 1],
    ['user', 'removed', 0],
    ['admin', 'deleted', 0],
  ] as const)(
    'a %s with a %s root Tombstone sees %i Restore button',
    async (role, kind, count) => {
      mockedComments.listComments.mockResolvedValue({
        items: [
          { ...root, tombstone: kind, text: '', userId: null, author: null },
          reply,
        ],
        total: 2,
        limit: 100,
        offset: 0,
      });
      renderAs(role);
      await screen.findByText('Agreed');

      expect(screen.queryAllByRole('button', { name: 'Restore' })).toHaveLength(
        count
      );
    }
  );

  it('shows a Moderator a Removed root that has no live reply, and Restore calls the server', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [
        {
          ...root,
          tombstone: 'removed',
          text: '',
          userId: null,
          author: null,
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
    mockedComments.restoreComment.mockResolvedValue(root);
    renderAs('admin');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Restore' })
    );

    await waitFor(() =>
      expect(mockedComments.restoreComment).toHaveBeenCalledWith(5)
    );
  });

  it('hides that same Removed root from a plain user', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [
        {
          ...root,
          tombstone: 'removed',
          text: '',
          userId: null,
          author: null,
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
    renderSignedIn();

    expect(await screen.findByText('No comments yet.')).toBeInTheDocument();
  });

  it('prompts an anonymous visitor to sign in instead of offering a composer', async () => {
    renderWithProviders(<CommentSection bookId={1} />);

    expect(
      await screen.findByText('Sign in to join the discussion.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add comment' })).toBeNull();
  });

  it('is read-only when closed, even for a signed-in visitor', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.session, viewer);
    renderWithProviders(<CommentSection bookId={1} closed />, { queryClient });

    expect(await screen.findByText('A fine book')).toBeInTheDocument();
    expect(
      screen.getByText('Comments are closed while this book is a draft.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add comment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('offers Reply on the top-level comment and on its reply', async () => {
    renderSignedIn();

    await screen.findByText('A fine book');

    expect(screen.getAllByRole('button', { name: 'Reply' })).toHaveLength(2);
  });

  it('files a reply to a reply under their root', async () => {
    mockedComments.createComment.mockResolvedValue({ ...reply, id: 7 });

    renderSignedIn();
    await screen.findByText('Agreed');

    await userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[1]!);
    // Not named: under Jest the dialog and the focused IconButton's tooltip
    // share the id `test-id`, so the dialog's aria-labelledby reads "Reply".
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Reply to Oth Er')).toBeInTheDocument();
    expect(within(dialog).getByText('Agreed')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Me too');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Post' }));

    // Two levels only: the new reply joins the thread, not the reply.
    expect(mockedComments.createComment).toHaveBeenCalledWith({
      bookId: 1,
      parentId: 5,
      text: 'Me too',
    });
  });

  it('offers no Reply on a reply whose root is a Tombstone', async () => {
    mockedComments.listComments.mockResolvedValue({
      items: [
        { ...root, text: '', tombstone: 'deleted', userId: null, author: null },
        reply,
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    renderSignedIn();
    await screen.findByText('Agreed');

    // The server refuses a reply under a Tombstone.
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
  });

  it('posts a top-level comment', async () => {
    mockedComments.createComment.mockResolvedValue({ ...root, id: 7 });

    renderSignedIn();
    await screen.findByText('A fine book');

    await addComment();
    expect(
      screen.getByRole('dialog', { name: 'New comment' })
    ).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    expect(mockedComments.createComment).toHaveBeenCalledWith({
      bookId: 1,
      parentId: null,
      text: 'New',
    });
  });

  it('offers no Post for blank text', async () => {
    renderSignedIn();
    await screen.findByText('A fine book');

    await addComment();
    await userEvent.type(screen.getByRole('textbox'), '   ');

    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('shows the comment being replied to above the field', async () => {
    renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]!);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Reply to Read Er')).toBeInTheDocument();
    expect(within(dialog).getByText('A fine book')).toBeInTheDocument();
    // Read-only: the quoted comment carries none of its controls.
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Reply' })).toBeNull();
  });

  it('posts a reply against the comment being replied to', async () => {
    mockedComments.createComment.mockResolvedValue({ ...root, id: 7 });

    renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]!);
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

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit comment')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox')).toHaveValue('A fine book');
    expect(
      within(dialog).getByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
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

  it("offers Report on someone else's comment and never on your own", async () => {
    renderSignedIn();
    await screen.findByText('Agreed');
    expect(screen.getAllByRole('button', { name: 'Report' })).toHaveLength(1);
  });

  it('offers no Report to a Guest', async () => {
    renderWithProviders(<CommentSection bookId={1} />);
    await screen.findByText('Agreed');
    expect(screen.queryByRole('button', { name: /report/i })).toBeNull();
  });

  // Opens the modal on `reply` (id 6), picks Spam and sends, with the click on Send as given.
  const reportReply = async (send: (button: HTMLElement) => Promise<void>) => {
    renderSignedIn();
    await screen.findByText('Agreed');
    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Spam' }));
    await send(screen.getByRole('button', { name: /Send report/ }));
  };

  it('sends a report, closes the modal and refetches the thread', async () => {
    mockedReports.reportComment.mockResolvedValue({ id: 1 });
    await reportReply((b) => userEvent.click(b));
    await waitFor(() =>
      expect(mockedReports.reportComment).toHaveBeenCalledWith(6, {
        reason: 'spam',
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockedComments.listComments).toHaveBeenCalledTimes(2);
  });

  it('sends once on a double click', async () => {
    mockedReports.reportComment.mockReturnValue(new Promise(() => {}));
    await reportReply((b) => userEvent.dblClick(b));
    expect(mockedReports.reportComment).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      new ApiError(409, 'This comment already has an open report.'),
      'This comment already has an open report.',
    ],
    [new ApiError(500, 'boom'), 'Could not send the report.'],
  ])(
    'keeps the modal open and shows the message for %p',
    async (error, message) => {
      mockedReports.reportComment.mockRejectedValue(error);
      await reportReply((b) => userEvent.click(b));
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    }
  );
});

describe('CommentSection Unsaved text', () => {
  it('restores the root composer after a remount', async () => {
    const { store, queryClient, unmount } = renderSignedIn();
    await screen.findByText('A fine book');
    await addComment();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Write a comment' }),
      'Half a thought'
    );

    unmount();
    renderWithProviders(<CommentSection bookId={1} />, { store, queryClient });

    await screen.findByText('A fine book');
    await addComment();
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

  it('leaves no entry behind for an Edit opened and left unchanged', async () => {
    const { store } = renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.type(screen.getByRole('textbox'), '!{Backspace}');

    expect(screen.getByRole('textbox')).toHaveValue('A fine book');
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('keeps an edit cleared to nothing empty', async () => {
    renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.clear(screen.getByRole('textbox'));

    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('keeps the text when the post fails', async () => {
    mockedComments.createComment.mockRejectedValue(
      new ApiError(500, 'Server error')
    );
    const { store } = renderSignedIn();
    await screen.findByText('A fine book');

    await addComment();
    await userEvent.type(screen.getByRole('textbox'), 'Keep me');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // The modal stays open over the failure.
    expect(
      await screen.findByText('Could not post the comment.')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Keep me');
    expect(store.getState().unsavedText.entries['book:1:comment']?.text).toBe(
      'Keep me'
    );
  });

  it('clears the text once the post succeeds', async () => {
    mockedComments.createComment.mockResolvedValue({ ...root, id: 7 });
    const { store } = renderSignedIn();
    await screen.findByText('A fine book');

    await addComment();
    await userEvent.type(screen.getByRole('textbox'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('keeps the text when the modal is cancelled', async () => {
    const { store } = renderSignedIn();
    await screen.findByText('A fine book');

    await addComment();
    await userEvent.type(screen.getByRole('textbox'), 'Later');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(store.getState().unsavedText.entries['book:1:comment']?.text).toBe(
      'Later'
    );
    await addComment();
    expect(screen.getByRole('textbox')).toHaveValue('Later');
  });

  it('closes a reply whose comment becomes a Tombstone and offers its text', async () => {
    const { queryClient } = renderSignedIn();
    await screen.findByText('A fine book');

    await userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]!);
    await userEvent.type(screen.getByRole('textbox'), 'Too late');
    act(() => {
      queryClient.setQueryData(queryKeys.comments(1), {
        items: [
          {
            ...root,
            text: '',
            tombstone: 'deleted',
            userId: null,
            author: null,
          },
          reply,
        ],
        total: 2,
        limit: 100,
        offset: 0,
      });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('textbox', { name: 'Unsaved text' })).toHaveValue(
      'Too late'
    );
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

    await addComment();
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
