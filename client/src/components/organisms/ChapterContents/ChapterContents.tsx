import { useRef } from 'react';
import type { FC } from 'react';
import { Drawer, Flex, theme } from 'antd';
import { Link } from 'react-router';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import type { BookDetail } from '@/types/book';
import type { ChapterSummary } from '@/types/chapter';
import styles from './ChapterContents.module.css';

interface ChapterContentsProps {
  book: BookDetail | undefined;
  // Already narrowed to the chapters that are out, in Reading order.
  chapters: ChapterSummary[];
  currentId: number;
  open: boolean;
  onClose: () => void;
}

// The reader's table of contents: the Book's card over its chapters, the one
// being read marked, and a pick closing the drawer on the way to it.
export const ChapterContents: FC<ChapterContentsProps> = ({
  book,
  chapters,
  currentId,
  open,
  onClose,
}) => {
  const { token } = theme.useToken();
  const current = useRef<HTMLAnchorElement>(null);

  return (
    <Drawer
      title="Contents"
      placement="left"
      open={open}
      onClose={onClose}
      afterOpenChange={(opened) => {
        if (opened) current.current?.scrollIntoView({ block: 'center' });
      }}
    >
      <Flex vertical gap={token.margin}>
        {book && <BookCard book={book} />}
        <nav aria-label="Chapters">
          <ol className={styles.list}>
            {chapters.map((chapter) => {
              const isCurrent = chapter.id === currentId;
              return (
                <li key={chapter.id}>
                  <Link
                    ref={isCurrent ? current : undefined}
                    to={`/books/${chapter.bookId}/chapters/${chapter.id}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={`${styles.item} ${isCurrent ? styles.current : ''}`}
                    onClick={onClose}
                  >
                    {chapter.title}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      </Flex>
    </Drawer>
  );
};
