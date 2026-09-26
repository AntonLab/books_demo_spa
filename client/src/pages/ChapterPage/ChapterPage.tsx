import { useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Flex,
  Skeleton,
  theme,
  Tooltip,
  Typography,
} from 'antd';
import type { ThemeConfig } from 'antd';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ColumnHeightOutlined,
  ReadOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { ChapterContents } from '@/components/organisms/ChapterContents/ChapterContents';
import { ReadingPreferences } from '@/components/organisms/ReadingPreferences/ReadingPreferences';
import { useBook } from '@/queries/books';
import { useChapter, useChapters } from '@/queries/chapters';
import { devicePreferences } from '@/store/devicePreferencesSlice';
import type { ReadingPreferences as Reading } from '@/store/devicePreferencesSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { READING_PALETTES, READING_SERIF_FONT } from '@/theme/tokens';
import { publishedChapters, type ChapterSummary } from '@/types/chapter';
import {
  arrowLabel,
  OPEN_ON_LAST_PAGE,
  opensOnLastPage,
  pageIndicator,
  toParagraphs,
} from './pagination';
import type { Direction } from './pagination';
import { usePages } from './usePages';
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

const ARROW_ICONS: Record<Direction, ReactNode> = {
  previous: <ArrowLeftOutlined />,
  next: <ArrowRightOutlined />,
};

const chapterPath = (target: ChapterSummary) =>
  `/books/${target.bookId}/chapters/${target.id}`;

interface ChapterArrowProps {
  direction: Direction;
  target: ChapterSummary | undefined;
  size?: 'large';
}

// Scroll's arrows. A real link (middle-click opens a tab) routed in-app on a
// plain click; at either end of the book it stays in place, disabled, so the
// bar never jumps.
const ChapterArrow: FC<ChapterArrowProps> = ({ direction, target, size }) => {
  const navigate = useNavigate();
  const label = arrowLabel(direction, false, target);

  if (target === undefined) {
    return (
      <Button
        aria-label={label}
        icon={ARROW_ICONS[direction]}
        size={size}
        disabled
      />
    );
  }
  const href = chapterPath(target);
  return (
    <Button
      aria-label={label}
      icon={ARROW_ICONS[direction]}
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
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [contentsOpen, setContentsOpen] = useState(false);
  const pagesOn = reading.layout === 'pages';
  const openOnLastPage = opensOnLastPage(location.state);

  // The same cache keys BookPage already filled, so arriving from the book
  // page costs no request: only the body below is fetched here.
  const { data: bookDetail } = useBook(book);
  const { data: list } = useChapters(book);
  const { data: chapter, isPending, isError } = useChapter(id);

  // Destructured: react-hooks/refs reads any property of an object holding
  // refs as a ref read during render.
  const {
    probeRef,
    stripRef,
    start,
    pageCount,
    perView,
    animate,
    windowStyle,
    stripStyle,
    hasPage,
    turn,
  } = usePages({
    enabled: pagesOn,
    chapterId: id,
    text: chapter?.text,
    reading,
    openOnLastPage,
  });

  // Browser history keeps this state across a reload, which must open page 1:
  // once read (usePages took it when the chapter changed), it is dropped.
  useEffect(() => {
    if (openOnLastPage) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [openOnLastPage, location.pathname, navigate]);

  // Navigation is derived from the chapter's position in the list rather than
  // from an id arithmetic: chapter ids are not contiguous once one is deleted.
  // Only chapters that are out count — a Co-author's list also carries drafts
  // and scheduled ones, and a reader's previous/next must not lead to either.
  const items = publishedChapters(list?.items ?? []);
  const index = items.findIndex((item) => item.id === id);
  const previous = index > 0 ? items[index - 1] : undefined;
  const next =
    index >= 0 && index < items.length - 1 ? items[index + 1] : undefined;

  // Pages: turn while a page is left, otherwise hand off to the neighbouring
  // chapter, the previous one opening on its last page.
  const go = (direction: Direction) => {
    if (hasPage(direction)) {
      turn(direction);
      return;
    }
    const target = direction === 'previous' ? previous : next;
    if (target === undefined) return;
    void navigate(
      chapterPath(target),
      direction === 'previous' ? { state: OPEN_ON_LAST_PAGE } : undefined
    );
  };

  if (isError) {
    return <Alert type="error" title="Could not load this chapter." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  // In Pages an arrow stays one button whose label and action change, so a
  // keyboard reader keeps focus on it as it passes from a page to a chapter.
  const arrow = (direction: Direction, size?: 'large') => {
    const target = direction === 'previous' ? previous : next;
    if (!pagesOn) {
      return <ChapterArrow direction={direction} target={target} size={size} />;
    }
    const turnsPage = hasPage(direction);
    return (
      <Button
        aria-label={arrowLabel(direction, turnsPage, target)}
        icon={ARROW_ICONS[direction]}
        size={size}
        disabled={!turnsPage && target === undefined}
        onClick={() => go(direction)}
      />
    );
  };

  const toggleLabel = pagesOn ? 'Switch to scroll' : 'Switch to pages';

  return (
    <article>
      <Flex justify="space-between" align="center" className={styles.toolbar}>
        {arrow('previous')}
        <Flex gap={token.marginXS}>
          <Button
            icon={<UnorderedListOutlined aria-hidden />}
            onClick={() => setContentsOpen(true)}
          >
            Contents
          </Button>
          {/* The icon shows the layout the button switches to. */}
          <Tooltip title={toggleLabel}>
            <Button
              aria-label={toggleLabel}
              icon={pagesOn ? <ColumnHeightOutlined /> : <ReadOutlined />}
              onClick={() =>
                dispatch(
                  devicePreferences.readingChanged({
                    layout: pagesOn ? 'scroll' : 'pages',
                  })
                )
              }
            />
          </Tooltip>
          <ReadingPreferences />
        </Flex>
        {arrow('next')}
      </Flex>

      <ConfigProvider theme={readingTheme(reading)}>
        <Card variant="borderless">
          {pagesOn ? (
            <div
              style={{
                fontSize: reading.fontSize,
                lineHeight: reading.lineHeight,
              }}
            >
              <div
                ref={probeRef}
                className={`${styles.probe} ${styles[reading.width] ?? ''}`}
              />
              {/* Off-page text is clipped, never aria-hidden: a screen reader
                  still reads the whole chapter. */}
              <div className={styles.window} style={windowStyle}>
                <div
                  ref={stripRef}
                  className={`${styles.strip} ${animate ? styles.turning : ''}`}
                  style={stripStyle}
                >
                  <Typography.Title level={2}>{chapter.title}</Typography.Title>
                  {toParagraphs(chapter.text).map((paragraph, at) => (
                    <Typography.Paragraph key={at} className={styles.paragraph}>
                      {paragraph}
                    </Typography.Paragraph>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Size and spacing are the reader's own numbers, so they go
               inline; the width is in `ch`, measured at that size, so a line
               holds as many characters whatever the size. */
            <div
              className={`${styles.column} ${styles[reading.width] ?? ''}`}
              style={{
                fontSize: reading.fontSize,
                lineHeight: reading.lineHeight,
              }}
            >
              <Typography.Title level={2}>{chapter.title}</Typography.Title>

              {/* The body is authored text, so its line breaks are content
                  rather than markup and are preserved instead of collapsed. */}
              <Typography.Paragraph className={styles.text}>
                {chapter.text}
              </Typography.Paragraph>
            </div>
          )}
        </Card>
      </ConfigProvider>

      <Flex justify="space-between" align="center" className={styles.toolbar}>
        {arrow('previous', 'large')}
        {pagesOn && (
          <Typography.Text aria-live="polite">
            {pageIndicator(start, pageCount, perView)}
          </Typography.Text>
        )}
        {arrow('next', 'large')}
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
