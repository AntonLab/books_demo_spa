import { useEffect, useRef } from 'react';
import { useReadingProgressMutation } from '@/queries/library';

interface Args {
  bookId: number;
  chapterId: number;
  // False for a Guest, a Co-author, or while the chapter is not loaded.
  enabled: boolean;
  // The reader has reached the end of the text.
  atEnd: boolean;
}

// Reports `opened` once per Chapter open and `finished` once at the end of its
// text. The refs hold the last Chapter reported, so a re-render or a
// StrictMode double effect repeats nothing.
export const useReadingProgress = ({
  bookId,
  chapterId,
  enabled,
  atEnd,
}: Args): void => {
  const { mutate } = useReadingProgressMutation();
  const opened = useRef<number>(undefined);
  const finished = useRef<number>(undefined);

  useEffect(() => {
    if (!enabled || opened.current === chapterId) return;
    opened.current = chapterId;
    mutate({ bookId, payload: { event: 'opened', chapterId } });
  }, [enabled, bookId, chapterId, mutate]);

  useEffect(() => {
    if (!enabled || !atEnd || finished.current === chapterId) return;
    finished.current = chapterId;
    mutate({ bookId, payload: { event: 'finished', chapterId } });
  }, [enabled, atEnd, bookId, chapterId, mutate]);
};
