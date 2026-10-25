import type { FC } from 'react';
import { CommentOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Divider, Tabs } from 'antd';
import { BookStatistics } from '@/components/organisms/BookStatistics/BookStatistics';
import { BookReadingListsTab } from '@/components/organisms/BookReadingListsTab/BookReadingListsTab';
import type { BookReadingLists } from '@/components/organisms/BookReadingListsTab/useBookReadingLists';
import { ChapterList } from '@/components/organisms/ChapterList/ChapterList';
import { CommentSection } from '@/components/organisms/CommentSection/CommentSection';
import type { useChapters } from '@/queries/chapters';
import { publishedChapters } from '@/types/chapter';
import type { BookDetail } from '@/types/book';
import styles from './BookPage.module.css';

interface BookSectionsProps {
  book: BookDetail;
  chapters: ReturnType<typeof useChapters>;
  readingLists: BookReadingLists;
}

export const BookSections: FC<BookSectionsProps> = ({
  book,
  chapters,
  readingLists,
}) => {
  // The public list: only what is out, even for a Co-author, who manages the
  // rest from the Edit modal. The Chapters and Statistics tabs share it, so
  // they cannot disagree about what is out.
  const published = publishedChapters(chapters.data?.items ?? []);
  // No count until the first response is in, so no false (0) flashes.
  const readingListsLabel =
    readingLists.isPending || readingLists.error !== null
      ? 'Reading lists'
      : `Reading lists (${readingLists.total})`;

  return (
    <>
      {/* Uncontrolled: the open tab is this page's own state (ADR-0010) and
          never reaches the URL, so a reload opens Chapters. */}
      <Tabs
        className={styles.tabs}
        classNames={{ body: styles.tabsBody }}
        items={[
          {
            key: 'chapters',
            label: 'Chapters',
            children: (
              <ChapterList
                bookId={book.id}
                items={published}
                isPending={chapters.isPending}
                isError={chapters.isError}
              />
            ),
          },
          {
            key: 'statistics',
            label: 'Statistics',
            children: (
              <BookStatistics
                book={book}
                chapters={published}
                isPending={chapters.isPending}
                isError={chapters.isError}
              />
            ),
          },
        ]}
      />

      <Divider />

      {/* Uncontrolled like the set above: the open tab is page state
          (ADR-0010), so a reload opens Comments. No fixed body height: the
          thread grows with the page. A tab is named by its content, so the
          icon stays aria-hidden and the text stays inside the tab; rc-tabs
          has no hook for an aria-label on the tab. */}
      <Tabs
        items={[
          {
            key: 'comments',
            icon: <CommentOutlined aria-hidden />,
            label: 'Comments',
            children: (
              // Nobody comments on a Draft book; the server answers 403
              // either way.
              <CommentSection
                bookId={book.id}
                closed={book.status === 'draft'}
              />
            ),
          },
          {
            key: 'readingLists',
            icon: <UnorderedListOutlined aria-hidden />,
            label: readingListsLabel,
            children: <BookReadingListsTab list={readingLists} />,
          },
        ]}
      />
    </>
  );
};
