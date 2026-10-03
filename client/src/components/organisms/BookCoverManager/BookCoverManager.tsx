import type { FC } from 'react';
import { CoverManager } from '@/components/organisms/CoverManager/CoverManager';
import { useDeleteBookCover, useUploadBookCover } from '@/queries/books';

interface BookCoverManagerProps {
  bookId: number;
  coverUrl: string | null;
  title: string;
}

// An organism rather than a molecule because it owns the upload and delete
// mutations, which CoverManager takes as props.
export const BookCoverManager: FC<BookCoverManagerProps> = ({
  bookId,
  coverUrl,
  title,
}) => (
  <CoverManager
    coverUrl={coverUrl}
    title={title}
    upload={useUploadBookCover(bookId)}
    remove={useDeleteBookCover(bookId)}
  />
);
