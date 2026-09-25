import { act, waitFor } from '@testing-library/react';
import { useChapterEdit } from './useChapterEdit';
import type { ChapterEdit } from './useChapterEdit';
import { renderHookWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as chaptersApi from '@/api/chapters';
import type { AppStore, RootState } from '@/store';
import type { UnsavedTextEntry } from '@/store/unsavedTextSlice';
import type { PublicChapter } from '@/types/chapter';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/chapters');

const mockedChapters = jest.mocked(chaptersApi);

const chapter: PublicChapter = {
  id: 9,
  bookId: 1,
  title: 'Chapter One',
  text: 'It was a dark night.',
  publishedAt: null,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T08:15:30.123Z',
};

const viewer: PublicUser = {
  id: 3,
  login: 'ann',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const key = 'book:1:chapter:9';
const olderBase = '2026-09-09T00:00:00.000Z';
const newer = '2026-09-13T09:00:00.000Z';

const typedAgainst = (
  entry: Partial<UnsavedTextEntry> = {}
): Partial<RootState> => ({
  unsavedText: {
    accountId: 3,
    entries: {
      [key]: {
        title: 'Chapter One',
        text: 'My text',
        baseUpdatedAt: chapter.updatedAt,
        savedAt: '2026-09-23T10:00:00.000Z',
        ...entry,
      },
    },
  },
});

const renderEdit = async (preloadedState?: Partial<RootState>) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, viewer);
  const rendered = renderHookWithProviders(() => useChapterEdit(1, 9), {
    queryClient,
    preloadedState,
  });
  await waitFor(() => expect(rendered.result.current.status).toBe('ready'));
  return rendered;
};

const ready = (edit: ChapterEdit) => {
  if (edit.status !== 'ready') throw new Error(`Not ready: ${edit.status}`);
  return edit;
};

const entryOf = (store: AppStore) => store.getState().unsavedText.entries[key];

// Holds updateChapter open until the returned function lands it.
const holdSave = () => {
  let land: (saved: PublicChapter) => void = () => {};
  mockedChapters.updateChapter.mockImplementation(
    () =>
      new Promise((resolve) => {
        land = resolve;
      })
  );
  return (saved: PublicChapter) => land(saved);
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedChapters.getChapter.mockResolvedValue(chapter);
});

describe('useChapterEdit', () => {
  it('shows the conflict when the reloaded chapter is newer than the typing', async () => {
    const { result } = await renderEdit(
      typedAgainst({ baseUpdatedAt: olderBase })
    );

    expect(ready(result.current).conflict).toBe(true);
    expect(ready(result.current).initialValues).toEqual({
      title: 'Chapter One',
      text: 'My text',
    });
    expect(mockedChapters.updateChapter).not.toHaveBeenCalled();
  });

  it('saves against the version the Unsaved text was typed on, not the one reloaded', async () => {
    mockedChapters.updateChapter.mockRejectedValue(
      new ApiError(409, 'This chapter was changed since you loaded it')
    );
    const { result } = await renderEdit(
      typedAgainst({ baseUpdatedAt: olderBase })
    );

    act(() =>
      ready(result.current).save({
        title: 'Chapter One',
        text: 'My text',
        publishedAt: null,
      })
    );

    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenCalledWith(9, {
        title: 'Chapter One',
        text: 'My text',
        publishedAt: null,
        expectedUpdatedAt: olderBase,
      })
    );
  });

  it('keeps text typed while a save was in flight, rebased onto that save', async () => {
    const land = holdSave();
    const { result, store } = await renderEdit();

    act(() =>
      ready(result.current).onValuesChange({
        title: chapter.title,
        text: 'It was a dark night.!',
      })
    );
    act(() =>
      ready(result.current).save({
        title: chapter.title,
        text: 'It was a dark night.!',
        publishedAt: null,
      })
    );
    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenCalled()
    );
    act(() =>
      ready(result.current).onValuesChange({
        title: chapter.title,
        text: 'It was a dark night.!?',
      })
    );
    await act(async () =>
      land({ ...chapter, text: 'It was a dark night.!', updatedAt: newer })
    );

    // The refetch still answers the old version, so a base compared with
    // `!==` would flag the Account's own save as a conflict here.
    await waitFor(() => expect(entryOf(store)?.baseUpdatedAt).toBe(newer));
    expect(entryOf(store)?.text).toBe('It was a dark night.!?');
    expect(ready(result.current).conflict).toBe(false);
  });

  it('bases text typed right after a save on that save, not the stale chapter', async () => {
    mockedChapters.updateChapter.mockResolvedValue({
      ...chapter,
      updatedAt: newer,
    });
    const { result, store } = await renderEdit();

    act(() =>
      ready(result.current).save({
        title: chapter.title,
        text: chapter.text,
        publishedAt: null,
      })
    );
    await waitFor(() => expect(ready(result.current).saved).toBe(true));
    // getChapter still answers the pre-save version: the refetch lags.
    act(() =>
      ready(result.current).onValuesChange({
        title: chapter.title,
        text: `${chapter.text}!`,
      })
    );

    expect(entryOf(store)?.baseUpdatedAt).toBe(newer);
    expect(ready(result.current).conflict).toBe(false);
  });

  it('leaves no entry behind for text changed back to the saved chapter', async () => {
    const { result, store } = await renderEdit();

    act(() =>
      ready(result.current).onValuesChange({
        title: chapter.title,
        text: `${chapter.text}!`,
      })
    );
    act(() =>
      ready(result.current).onValuesChange({
        title: chapter.title,
        text: chapter.text,
      })
    );

    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('compares against a landed save, not the stale chapter', async () => {
    mockedChapters.updateChapter.mockResolvedValue({
      ...chapter,
      text: 'A darker night.',
      updatedAt: newer,
    });
    const { result, store } = await renderEdit();

    act(() =>
      ready(result.current).save({
        title: chapter.title,
        text: 'A darker night.',
        publishedAt: null,
      })
    );
    await waitFor(() => expect(ready(result.current).saved).toBe(true));
    act(() =>
      ready(result.current).onValuesChange({
        title: chapter.title,
        text: 'A darker night.!',
      })
    );
    act(() =>
      ready(result.current).onValuesChange({
        title: chapter.title,
        text: 'A darker night.',
      })
    );

    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('keeps an entry cleared to nothing, with the version it was typed on', async () => {
    const { result, store } = await renderEdit();

    act(() => ready(result.current).onValuesChange({ title: '', text: '' }));

    expect(entryOf(store)).toEqual({
      title: '',
      text: '',
      baseUpdatedAt: chapter.updatedAt,
      savedAt: expect.any(String),
    });
  });

  it('sends the new base on the save after a 409 and Keep mine', async () => {
    mockedChapters.updateChapter.mockRejectedValueOnce(
      new ApiError(409, 'This chapter was changed since you loaded it')
    );
    const { result, store } = await renderEdit();
    const mine = { title: chapter.title, text: 'My version' };

    act(() => ready(result.current).onValuesChange(mine));
    act(() => ready(result.current).save({ ...mine, publishedAt: null }));
    await waitFor(() => expect(ready(result.current).conflict).toBe(true));
    expect(ready(result.current).saveError).toBeNull();

    mockedChapters.getChapter.mockResolvedValue({
      ...chapter,
      text: 'Their version',
      updatedAt: newer,
    });
    await act(async () => {
      await ready(result.current).keepMine();
    });
    expect(ready(result.current).conflict).toBe(false);
    expect(entryOf(store)?.text).toBe('My version');

    mockedChapters.updateChapter.mockResolvedValue({
      ...chapter,
      ...mine,
      updatedAt: '2026-09-14T00:00:00.000Z',
    });
    act(() => ready(result.current).save({ ...mine, publishedAt: null }));

    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenLastCalledWith(9, {
        ...mine,
        publishedAt: null,
        expectedUpdatedAt: newer,
      })
    );
  });

  it('discards the entry and remounts the form on Use their version', async () => {
    const { result, store } = await renderEdit(
      typedAgainst({ baseUpdatedAt: olderBase })
    );
    const before = ready(result.current).formKey;

    await act(async () => {
      await ready(result.current).takeTheirs();
    });

    expect(store.getState().unsavedText.entries).toEqual({});
    // The version on screen did not change; the key still must.
    expect(ready(result.current).formKey).not.toBe(before);
    expect(ready(result.current).initialValues).toEqual({
      title: chapter.title,
      text: chapter.text,
    });
    expect(ready(result.current).conflict).toBe(false);
  });

  it('clears the entry for a save that lands after unmount', async () => {
    const land = holdSave();
    const { result, store, unmount } = await renderEdit();

    act(() =>
      ready(result.current).onValuesChange({
        title: chapter.title,
        text: 'It was a dark night.!',
      })
    );
    act(() =>
      ready(result.current).save({
        title: chapter.title,
        text: 'It was a dark night.!',
        publishedAt: null,
      })
    );
    await waitFor(() =>
      expect(mockedChapters.updateChapter).toHaveBeenCalled()
    );
    unmount();
    // mutateAsync's promise settles whether or not its caller is still
    // mounted; mutate's per-call onSuccess would not fire here.
    await act(async () =>
      land({ ...chapter, text: 'It was a dark night.!', updatedAt: newer })
    );

    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('discards the entry once the chapter is deleted', async () => {
    mockedChapters.deleteChapter.mockResolvedValue(undefined);
    const { result, store } = await renderEdit(typedAgainst());

    await act(async () => {
      await result.current.remove();
    });

    expect(mockedChapters.deleteChapter).toHaveBeenCalledWith(9);
    expect(store.getState().unsavedText.entries).toEqual({});
  });
});
