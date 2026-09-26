import type { FC, ReactNode } from 'react';
import { Descriptions, Skeleton, Typography } from 'antd';
import { formatDate } from '@/format/date';
import type { BookDetail } from '@/types/book';
import type { ChapterSummary } from '@/types/chapter';

interface BookStatisticsProps {
  book: Pick<BookDetail, 'likeCount' | 'commentCount' | 'wordCount'>;
  // The Published chapters in Reading order: the list the Chapters tab shows,
  // so the two tabs cannot disagree about what is out.
  chapters: ChapterSummary[];
  isPending: boolean;
  isError: boolean;
}

// The fixed `en` locale, as src/format/date.ts fixes it: one number style
// whatever the browser's language.
const formatCount = (value: number) => value.toLocaleString('en');

// Presentational, like ChapterList: the page owns both queries. Words, Likes
// and Comments come from the book detail; Chapters, Release time and Last
// update from the chapter list, so they wait for it and fail with it.
export const BookStatistics: FC<BookStatisticsProps> = ({
  book,
  chapters,
  isPending,
  isError,
}) => {
  const fromChapters = (value: ReactNode): ReactNode => {
    if (isError) {
      return <Typography.Text type="danger">Could not load</Typography.Text>;
    }
    if (isPending) return <Skeleton.Input active size="small" />;
    return value;
  };

  // Release time and Last update are the earliest and latest Publication
  // time (CONTEXT.md), not the first and last chapter in Reading order: a
  // chapter moved to the front keeps its own date.
  const times = chapters
    .flatMap((chapter) =>
      chapter.publishedAt === null ? [] : [chapter.publishedAt]
    )
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const dateOrDash = (iso: string | undefined) =>
    iso === undefined ? '—' : formatDate(iso);

  return (
    <Descriptions
      column={1}
      items={[
        {
          key: 'chapters',
          label: 'Chapters',
          children: fromChapters(formatCount(chapters.length)),
        },
        { key: 'words', label: 'Words', children: formatCount(book.wordCount) },
        { key: 'likes', label: 'Likes', children: formatCount(book.likeCount) },
        {
          key: 'comments',
          label: 'Comments',
          children: formatCount(book.commentCount),
        },
        {
          key: 'release-time',
          label: 'Release time',
          children: fromChapters(dateOrDash(times[0])),
        },
        {
          key: 'last-update',
          label: 'Last update',
          children: fromChapters(dateOrDash(times[times.length - 1])),
        },
      ]}
    />
  );
};
