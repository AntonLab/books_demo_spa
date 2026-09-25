import { useState } from 'react';
import { ApiError } from '@/api/client';
import type { ChapterFormValues } from '@/components/organisms/ChapterForm/ChapterForm';
import {
  useChapter,
  useDeleteChapter,
  useUpdateChapter,
} from '@/queries/chapters';
import { useAppDispatch } from '@/store/hooks';
import { unsavedText, unsavedTextKeys } from '@/store/unsavedTextSlice';
import { useUnsavedText } from '@/store/useUnsavedText';
import type { UnsavedText } from '@/store/useUnsavedText';

interface ChapterText {
  title: string;
  text: string;
}

interface ChapterEditCommon {
  // Offered in UnsavedTextNotice when the Chapter is gone or the Account may
  // no longer edit it.
  unsaved: UnsavedText;
  // Resolves once the Chapter is deleted and its entry discarded; rejects
  // with the error `removeState` also carries.
  remove: () => Promise<void>;
  removeState: { isPending: boolean; error: Error | null };
}

export type ChapterEdit =
  | (ChapterEditCommon & { status: 'pending' | 'error' | 'gone' })
  | (ChapterEditCommon & {
      status: 'ready';
      formKey: string;
      initialValues: ChapterText;
      publishedAt: string | null;
      conflict: boolean;
      saved: boolean;
      saveError: string | null;
      isSaving: boolean;
      save: (values: ChapterFormValues) => void;
      onValuesChange: (values: ChapterText) => void;
      takeTheirs: () => Promise<void>;
      keepMine: () => Promise<void>;
    });

// The server serialises every `updatedAt` as an ISO string of one format,
// so string order is time order.
const newest = (a: string, b: string | undefined): string =>
  b !== undefined && b > a ? b : a;

// The version rules of editing a Chapter against Co-authors' saves
// (.claude/rules/client/pages.md). The page only lays them out.
export const useChapterEdit = (
  bookId: number,
  chapterId: number
): ChapterEdit => {
  const key = unsavedTextKeys.chapter(bookId, chapterId);
  const dispatch = useAppDispatch();
  const unsaved = useUnsavedText(key);
  const chapter = useChapter(chapterId);
  const update = useUpdateChapter(bookId, chapterId);
  const deletion = useDeleteChapter(bookId, chapterId);
  // Bumped by "Use their version" to remount the form even when the version
  // on screen has not changed, so it lets go of the discarded text.
  const [resets, setResets] = useState(0);

  const common: ChapterEditCommon = {
    unsaved,
    // mutateAsync over mutate's per-call onSuccess: TanStack skips that
    // callback if the page unmounts before the mutation settles, but
    // mutateAsync's own promise still settles, so the entry is still
    // discarded.
    remove: () => deletion.mutateAsync(undefined).then(() => unsaved.discard()),
    removeState: { isPending: deletion.isPending, error: deletion.error },
  };

  if (chapter.isError) {
    const gone =
      chapter.error instanceof ApiError && chapter.error.status === 404;
    return { ...common, status: gone ? 'gone' : 'error' };
  }
  if (chapter.isPending) return { ...common, status: 'pending' };

  const { entry } = unsaved;
  const current = chapter.data;
  const saveRefused =
    update.error instanceof ApiError && update.error.status === 409;
  // Right after a save lands, `chapter.data` is still the version before it
  // until the refetch arrives; the save's own answer is the newer one.
  const latestUpdatedAt = newest(current.updatedAt, update.data?.updatedAt);
  // Shown before any save too: after a reload the refetched chapter can be
  // newer than the version the Unsaved text was typed against. A base newer
  // than `chapter.data` is the Account's own save awaiting the refetch.
  const conflict =
    saveRefused ||
    (entry?.baseUpdatedAt !== undefined &&
      current.updatedAt > entry.baseUpdatedAt);
  // The version the typing started from. Sending the refetched `updatedAt`
  // instead would let a save after a reload overwrite a Co-author's newer
  // version with no 409.
  const baseUpdatedAt = entry?.baseUpdatedAt ?? latestUpdatedAt;
  // What the place holds now, so text changed back to it leaves no entry.
  const latest =
    update.data && update.data.updatedAt === latestUpdatedAt
      ? update.data
      : current;

  return {
    ...common,
    status: 'ready',
    // Remounts the form on each new server version and on "Use their
    // version". It seeds from the Unsaved text when there is one, so a
    // remount never loses what was typed.
    formKey: `${current.updatedAt}#${resets}`,
    initialValues: entry
      ? { title: entry.title ?? '', text: entry.text }
      : { title: current.title, text: current.text },
    publishedAt: current.publishedAt,
    conflict,
    saved: update.isSuccess,
    saveError: saveRefused ? null : (update.error?.message ?? null),
    isSaving: update.isPending,
    onValuesChange: (values: ChapterText) => {
      unsaved.write({
        ...values,
        baseUpdatedAt,
        saved: { title: latest.title, text: latest.text },
      });
    },
    save: (values: ChapterFormValues) => {
      // mutateAsync over mutate's per-call onSuccess: TanStack skips that
      // callback if the page unmounts before the mutation settles (a click
      // on "Back to …" right after Save), but mutateAsync's own promise
      // still settles, so the entry is still cleared or rebased.
      void update
        .mutateAsync({ ...values, expectedUpdatedAt: baseUpdatedAt })
        .then(
          (landed) => {
            // Not a plain remove: text typed while the save was in flight
            // stays, rebased onto the version this save created.
            dispatch(
              unsavedText.saved({
                key,
                title: values.title,
                text: values.text,
                updatedAt: landed.updatedAt,
              })
            );
          },
          // A rejection is already surfaced through `saveError` or
          // `conflict`; this handler exists only so the rejection is not
          // left unhandled.
          () => {}
        );
    },
    takeTheirs: async () => {
      update.reset();
      unsaved.discard();
      setResets((count) => count + 1);
      await chapter.refetch();
    },
    // The next Save is then a deliberate overwrite of their version.
    keepMine: async () => {
      update.reset();
      const { data } = await chapter.refetch();
      if (data) {
        dispatch(unsavedText.rebase({ key, baseUpdatedAt: data.updatedAt }));
      }
    },
  };
};
