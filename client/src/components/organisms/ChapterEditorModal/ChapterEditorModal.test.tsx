import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChapterEditorModal } from './ChapterEditorModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { editorAccount, editorBook, editorChapter } from '@/test/editFixtures';
import { seedSession } from '@/test/session';
import { ApiError } from '@/api/client';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import * as illustrationsApi from '@/api/illustrations';
import type { RootState } from '@/store';
import type { PublicChapter } from '@/types/chapter';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/books');
jest.mock('@/api/chapters');
jest.mock('@/api/illustrations');

const mockedIllustrations = jest.mocked(illustrationsApi);
const mockedBooks = jest.mocked(booksApi);
const mockedChapters = jest.mocked(chaptersApi);
const onClose = jest.fn();

const typed = (key: string, extra = {}): Partial<RootState> => ({
  unsavedText: {
    accountId: 3,
    entries: {
      [key]: {
        title: 'Chapter One',
        text: 'My text',
        savedAt: '2026-09-23T10:00:00.000Z',
        ...extra,
      },
    },
  },
});
const editEntry = typed('book:1:chapter:9', {
  baseUpdatedAt: editorChapter.updatedAt,
});

const renderModal = (
  chapterId: number | null,
  session: PublicUser = editorAccount(),
  preloadedState?: Partial<RootState>
) => {
  const queryClient = createTestQueryClient();
  seedSession(queryClient, session);
  return renderWithProviders(
    <ChapterEditorModal bookId={1} chapterId={chapterId} onClose={onClose} />,
    { queryClient, preloadedState }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedBooks.getBook.mockResolvedValue(editorBook);
  mockedChapters.getChapter.mockResolvedValue(editorChapter);
  mockedIllustrations.listIllustrations.mockResolvedValue({ items: [] });
});

describe('ChapterEditorModal', () => {
  it('manages Illustrations of an existing chapter only', async () => {
    renderModal(9);
    expect(
      await screen.findByRole('heading', { name: 'Illustrations' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add illustration' })
    ).toBeInTheDocument();
  });

  it('shows no Illustrations section for a new chapter', async () => {
    renderModal(null);
    await screen.findByLabelText('Title');
    expect(screen.queryByRole('heading', { name: 'Illustrations' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Add illustration' })
    ).toBeNull();
    expect(mockedIllustrations.listIllustrations).not.toHaveBeenCalled();
  });

  it('creates the chapter from restored new-chapter text, closes and drops the entry', async () => {
    mockedChapters.createChapter.mockResolvedValue({
      ...editorChapter,
      publishedAt: '2026-09-13T00:00:00.000Z',
    });
    const { store } = renderModal(
      null,
      editorAccount(),
      typed('book:1:chapterNew')
    );

    expect(
      await screen.findByRole('dialog', { name: 'New chapter' })
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Title')).toHaveValue('Chapter One');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedChapters.createChapter).toHaveBeenCalledWith({
      bookId: 1,
      title: 'Chapter One',
      text: 'My text',
      publishedAt: 'now',
    });
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('sends one create for a double click on Publish', async () => {
    mockedChapters.createChapter.mockReturnValue(new Promise(() => {}));
    renderModal(null, editorAccount(), typed('book:1:chapterNew'));

    expect(await screen.findByLabelText('Title')).toHaveValue('Chapter One');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() =>
      expect(mockedChapters.createChapter).toHaveBeenCalledTimes(1)
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends again after a failed create and closes once it succeeds', async () => {
    mockedChapters.createChapter
      .mockRejectedValueOnce(new ApiError(500, 'Boom'))
      .mockResolvedValueOnce(editorChapter);
    renderModal(null, editorAccount(), typed('book:1:chapterNew'));

    expect(await screen.findByLabelText('Title')).toHaveValue('Chapter One');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText('Boom');
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedChapters.createChapter).toHaveBeenCalledTimes(2);
  });

  it('turns away an account that may not add chapters', async () => {
    renderModal(null, editorAccount({ id: 50, role: 'admin' }));
    expect(
      await screen.findByText(
        'Only its co-authors can add chapters to this book.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('saves an existing chapter against the loaded version and closes', async () => {
    mockedChapters.updateChapter.mockResolvedValue({
      ...editorChapter,
      text: 'A darker night.',
      updatedAt: '2026-09-13T09:00:00.000Z',
    });
    renderModal(9);
    const text = await screen.findByLabelText('Text');
    await userEvent.clear(text);
    await userEvent.type(text, 'A darker night.');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedChapters.updateChapter).toHaveBeenCalledWith(9, {
      title: 'Chapter One',
      text: 'A darker night.',
      publishedAt: null,
      expectedUpdatedAt: '2026-09-10T08:15:30.123Z',
    });
  });

  it('stays open with the conflict alert on a 409', async () => {
    mockedChapters.updateChapter.mockRejectedValue(
      new ApiError(409, 'This chapter was changed since you loaded it')
    );
    renderModal(9);
    await userEvent.type(await screen.findByLabelText('Text'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText(
        'A co-author changed this chapter since you started editing.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use their version' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Keep mine' })
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes silently with Unsaved text and keeps it', async () => {
    const { store } = renderModal(9);
    await userEvent.type(await screen.findByLabelText('Text'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard changes?')).toBeNull();
    expect(store.getState().unsavedText.entries).toHaveProperty(
      'book:1:chapter:9'
    );
  });

  it('does nothing when a save lands after the modal is gone', async () => {
    let land: (saved: PublicChapter) => void = () => {};
    mockedChapters.updateChapter.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = resolve;
        })
    );
    const { unmount } = renderModal(9);
    await userEvent.type(await screen.findByLabelText('Text'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenCalled()
    );
    unmount();
    await act(async () => land(editorChapter));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deletes the chapter once confirmed, drops its entry and closes', async () => {
    mockedChapters.deleteChapter.mockResolvedValue(undefined);
    const { store } = renderModal(9, editorAccount(), editEntry);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete chapter' })
    );
    expect(mockedChapters.deleteChapter).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedChapters.deleteChapter).toHaveBeenCalledWith(9);
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('offers the Unsaved text of a chapter that is gone', async () => {
    mockedChapters.getChapter.mockRejectedValue(new ApiError(404, 'Not found'));
    renderModal(9, editorAccount(), editEntry);
    expect(
      await screen.findByText('Could not load this chapter.')
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('textbox', { name: 'Unsaved text' })
    ).toHaveValue('Chapter One\n\nMy text');
  });

  it('removes the Unsaved text of a chapter that is gone on Discard', async () => {
    mockedChapters.getChapter.mockRejectedValue(new ApiError(404, 'Not found'));
    const { store } = renderModal(9, editorAccount(), editEntry);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Discard' })
    );
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Unsaved text' })).toBeNull()
    );
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('offers the Unsaved text, not the form, once the account may no longer edit', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...editorBook,
      authors: editorBook.authors.filter((a) => a.id !== 3),
    });
    renderModal(9, editorAccount(), editEntry);
    expect(
      await screen.findByText('You can no longer edit this chapter.')
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('textbox', { name: 'Unsaved text' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Text')).toBeNull();
  });
});
