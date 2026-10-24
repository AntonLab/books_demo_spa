import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { FC, MouseEvent, ReactNode } from 'react';
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
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ColumnHeightOutlined,
  ReadOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { ApiError } from '@/api/client';
import { BOOK_GONE } from '@/constants/goneMessages';
import { isId } from '@/types/id';
import { GoneRedirect } from '@/components/molecules/GoneRedirect/GoneRedirect';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import { ChapterIllustrations } from '@/components/organisms/ChapterIllustrations/ChapterIllustrations';
import { ChapterContents } from '@/components/organisms/ChapterContents/ChapterContents';
import { ReadingPreferences } from '@/components/organisms/ReadingPreferences/ReadingPreferences';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useChapter, useChapters } from '@/queries/chapters';
import { devicePreferences } from '@/store/devicePreferencesSlice';
import type { ReadingPreferences as Reading } from '@/store/devicePreferencesSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useRecordRecentlyViewed } from '@/store/useRecentlyViewed';
import { READING_PALETTES, READING_SERIF_FONT } from '@/theme/tokens';
import { bookCapabilities } from '@/types/capabilities';
import { publishedChapters, type ChapterSummary } from '@/types/chapter';
import {
  arrowLabel,
  directionForClick,
  directionForKey,
  OPEN_ON_LAST_PAGE,
  opensOnLastPage,
  pageIndicator,
  toParagraphs,
} from './pagination';
import type { Direction } from './pagination';
import { usePages } from './usePages';
import { useReadingProgress } from './useReadingProgress';
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
      <IconButton
        label={label}
        icon={ARROW_ICONS[direction]}
        size={size}
        disabled
      />
    );
  }
  const href = chapterPath(target);
  return (
    <IconButton
      label={label}
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

const CHAPTER_GONE = 'This chapter no longer exists.';

const ChapterGone: FC<{ book: number }> = ({ book }) => (
  <GoneRedirect message={CHAPTER_GONE} to={`/books/${book}`} />
);

// Split from the view so a bad id never mounts its queries: they would ask
// the server for an id it cannot answer for.
export const ChapterPage: FC = () => {
  const { bookId, chapterId } = useParams();
  const book = Number(bookId);
  const id = Number(chapterId);
  if (!isId(book)) return <GoneRedirect message={BOOK_GONE} />;
  if (!isId(id)) return <ChapterGone book={book} />;
  return <ChapterView book={book} id={id} />;
};

const ChapterView: FC<{ book: number; id: number }> = ({ book, id }) => {
  const { token } = theme.useToken();
  const reading = useAppSelector((state) => state.devicePreferences.reading);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [contentsOpen, setContentsOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const pagesOn = reading.layout === 'pages';
  const openOnLastPage = opensOnLastPage(location.state);

  // The same cache keys BookPage already filled, so arriving from the book
  // page costs no request: only the body below is fetched here.
  const { data: bookDetail } = useBook(book);
  const { data: list } = useChapters(book);
  const { data: chapter, isPending, isError, error } = useChapter(id);
  // A Chapter page opened without its Book page still counts for the Book.
  useRecordRecentlyViewed(chapter === undefined ? undefined : bookDetail);

  // Destructured: react-hooks/refs reads any property of an object holding
  // refs as a ref read during render.
  const {
    probeRef,
    stripRef,
    start,
    pageCount,
    perView,
    trailingSpace,
    animate,
    windowStyle,
    stripStyle,
    hasPage,
    ready,
    turn,
  } = usePages({
    enabled: pagesOn,
    chapterId: id,
    text: chapter?.text,
    reading,
    openOnLastPage,
  });

  // Scroll: the chapter whose end has come into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState<number>();
  const loaded = chapter !== undefined;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (pagesOn || !sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setScrolledToEnd(id);
        observer.disconnect();
      }
    });
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      setScrolledToEnd(undefined);
    };
  }, [pagesOn, id, loaded]);

  // Only a signed-in reader who is not a Co-author reports progress, and not
  // before the Book's credits are known.
  const { data: session } = useSession();
  useReadingProgress({
    bookId: book,
    chapterId: id,
    enabled:
      loaded &&
      session != null &&
      bookDetail !== undefined &&
      !bookCapabilities(bookDetail, session).isCoAuthor,
    // A chapter that fits the viewport has no scroll to reach the end of, so
    // its sentinel is in view at once and `finished` follows `opened`.
    atEnd: pagesOn ? ready && !hasPage('next') : scrolledToEnd === id,
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

  // The drawer and the popover need the arrow keys for themselves, and a
  // chapter still loading has no pages to turn.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (contentsOpen || preferencesOpen || chapter === undefined) return;
    const direction = directionForKey(event);
    if (direction === undefined) return;
    event.preventDefault();
    go(direction);
  });

  // Scroll leaves every key to the browser.
  useEffect(() => {
    if (!pagesOn) return;
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [pagesOn]);

  const onTextClick = (event: MouseEvent<HTMLDivElement>) => {
    // A drag that selects text ends in a click too.
    if (window.getSelection()?.isCollapsed === false) return;
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const direction = directionForClick(event.clientX, left, width);
    if (direction !== undefined) go(direction);
  };

  if (isError) {
    return error instanceof ApiError && error.status === 404 ? (
      <ChapterGone book={book} />
    ) : (
      <Alert type="error" title="Could not load this chapter." />
    );
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
      <IconButton
        label={arrowLabel(direction, turnsPage, target)}
        icon={ARROW_ICONS[direction]}
        size={size}
        disabled={!turnsPage && target === undefined}
        onClick={() => go(direction)}
      />
    );
  };

  const heading = (
    <Typography.Title level={2}>
      {index >= 0 ? `Chapter ${index + 1}. ${chapter.title}` : chapter.title}
    </Typography.Title>
  );

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
          <IconButton
            label={toggleLabel}
            icon={pagesOn ? <ColumnHeightOutlined /> : <ReadOutlined />}
            onClick={() =>
              dispatch(
                devicePreferences.readingChanged({
                  layout: pagesOn ? 'scroll' : 'pages',
                })
              )
            }
          />
          <ReadingPreferences onOpenChange={setPreferencesOpen} />
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
              {/* The keys do the same from the document listener, so the
                  click needs no key handler or role of its own. */}
              <div
                role="presentation"
                className={styles.window}
                style={windowStyle}
                onClick={onTextClick}
              >
                <div
                  ref={stripRef}
                  className={`${styles.strip} ${animate ? styles.turning : ''}`}
                  style={stripStyle}
                >
                  {heading}
                  {toParagraphs(chapter.text).map((paragraph, at) => (
                    <Typography.Paragraph key={at} className={styles.paragraph}>
                      {paragraph}
                    </Typography.Paragraph>
                  ))}
                </div>
              </div>
              {/* Outside the strip, which measurePages.ts measures: they
                  belong to the chapter's last page only. */}
              {!hasPage('next') && (
                <div
                  className={styles.illustrations}
                  style={{
                    width: windowStyle?.width,
                    marginTop: -trailingSpace,
                  }}
                >
                  <ChapterIllustrations chapterId={id} />
                </div>
              )}
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
              {heading}

              {/* The body is authored text, so its line breaks are content
                  rather than markup and are preserved instead of collapsed. */}
              <Typography.Paragraph className={styles.text}>
                {chapter.text}
              </Typography.Paragraph>

              {/* Zero height: reaching it is reaching the end of the text. */}
              <div ref={sentinelRef} />

              <ChapterIllustrations chapterId={id} />
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
