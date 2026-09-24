import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Flex,
  Skeleton,
  theme,
  Typography,
} from 'antd';
import type { ThemeConfig } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faArrowRight,
  faListUl,
} from '@fortawesome/free-solid-svg-icons';
import { ChapterContents } from '@/components/organisms/ChapterContents/ChapterContents';
import { ReadingPreferences } from '@/components/organisms/ReadingPreferences/ReadingPreferences';
import { useBook } from '@/queries/books';
import { useChapter, useChapters } from '@/queries/chapters';
import type { ReadingPreferences as Reading } from '@/store/devicePreferencesSlice';
import { useAppSelector } from '@/store/hooks';
import { READING_PALETTES, READING_SERIF_FONT } from '@/theme/tokens';
import { publishedChapters, type ChapterSummary } from '@/types/chapter';
import styles from './ChapterPage.module.css';

// Tokens for a ConfigProvider around the text: `auto` keeps the app's colours,
// and `sans` keeps its font.
const readingTheme = ({ background, font }: Reading): ThemeConfig => {
  const palette =
    background === 'auto' ? undefined : READING_PALETTES[background];
  return {
    token: {
      ...(palette && {
        colorBgContainer: palette.background,
        colorText: palette.text,
        colorTextHeading: palette.text,
      }),
      ...(font === 'serif' && { fontFamily: READING_SERIF_FONT }),
    },
  };
};

interface ChapterArrowProps {
  direction: 'previous' | 'next';
  target: ChapterSummary | undefined;
  size?: 'large';
}

// A real link (middle-click opens a tab) routed in-app on a plain click; at
// either end of the book it stays in place, disabled, so the bar never jumps.
const ChapterArrow: FC<ChapterArrowProps> = ({ direction, target, size }) => {
  const navigate = useNavigate();
  const label = direction === 'previous' ? 'Previous chapter' : 'Next chapter';
  const icon = (
    <FontAwesomeIcon
      icon={direction === 'previous' ? faArrowLeft : faArrowRight}
    />
  );

  if (target === undefined) {
    return <Button aria-label={label} icon={icon} size={size} disabled />;
  }
  const href = `/books/${target.bookId}/chapters/${target.id}`;
  return (
    <Button
      aria-label={`${label}: ${target.title}`}
      icon={icon}
      size={size}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        void navigate(href);
      }}
    />
  );
};

export const ChapterPage: FC = () => {
  const { token } = theme.useToken();
  const { bookId, chapterId } = useParams();
  const book = Number(bookId);
  const id = Number(chapterId);
  const reading = useAppSelector((state) => state.devicePreferences.reading);
  const [contentsOpen, setContentsOpen] = useState(false);

  // The same cache keys BookPage already filled, so arriving from the book
  // page costs no request: only the body below is fetched here.
  const { data: bookDetail } = useBook(book);
  const { data: list } = useChapters(book);
  const { data: chapter, isPending, isError } = useChapter(id);

  if (isError) {
    return <Alert type="error" title="Could not load this chapter." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  // Navigation is derived from the chapter's position in the list rather than
  // from an id arithmetic: chapter ids are not contiguous once one is deleted.
  // Only chapters that are out count — a Co-author's list also carries drafts
  // and scheduled ones, and a reader's previous/next must not lead to either.
  const items = publishedChapters(list?.items ?? []);
  const index = items.findIndex((item) => item.id === id);
  const previous = index > 0 ? items[index - 1] : undefined;
  const next =
    index >= 0 && index < items.length - 1 ? items[index + 1] : undefined;

  return (
    <article>
      <Flex justify="space-between" align="center" className={styles.toolbar}>
        <ChapterArrow direction="previous" target={previous} />
        <Flex gap={token.marginXS}>
          <Button
            icon={<FontAwesomeIcon icon={faListUl} />}
            onClick={() => setContentsOpen(true)}
          >
            Contents
          </Button>
          <ReadingPreferences />
        </Flex>
        <ChapterArrow direction="next" target={next} />
      </Flex>

      <ConfigProvider theme={readingTheme(reading)}>
        <Card variant="borderless">
          {/* Size and spacing are the reader's own numbers, so they go inline;
              the width is in `ch`, measured at that size, so a line holds as
              many characters whatever the size. */}
          <div
            className={`${styles.column} ${styles[reading.width] ?? ''}`}
            style={{
              fontSize: reading.fontSize,
              lineHeight: reading.lineHeight,
            }}
          >
            <Typography.Title level={2}>{chapter.title}</Typography.Title>

            {/* The body is authored text, so its line breaks are content rather
                than markup and are preserved instead of collapsed. */}
            <Typography.Paragraph className={styles.text}>
              {chapter.text}
            </Typography.Paragraph>
          </div>
        </Card>
      </ConfigProvider>

      <Flex justify="space-between" className={styles.toolbar}>
        <ChapterArrow direction="previous" target={previous} size="large" />
        <ChapterArrow direction="next" target={next} size="large" />
      </Flex>

      <ChapterContents
        book={bookDetail}
        chapters={items}
        currentId={id}
        open={contentsOpen}
        onClose={() => setContentsOpen(false)}
      />
    </article>
  );
};
