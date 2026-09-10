import { useQuery } from '@tanstack/react-query';
import { getChapter, listChapters } from '../api/chapters';
import { queryKeys } from './keys';

// ChapterPage reads this same key, so arriving from BookPage costs no request:
// only the chapter body is fetched there.
export const useChapters = (bookId: number) => {
  return useQuery({
    queryKey: queryKeys.chapters(bookId),
    queryFn: () => listChapters(bookId),
  });
};

export const useChapter = (id: number) => {
  return useQuery({
    queryKey: queryKeys.chapter(id),
    queryFn: () => getChapter(id),
  });
};
