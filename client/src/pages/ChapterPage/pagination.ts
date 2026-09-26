import type { ReadingWidth } from '@/store/devicePreferencesSlice';

// The rules of the Pages Reading layout, free of layout so Jest can test them
// (measurePages.ts holds every read of the real one).

export type Direction = 'previous' | 'next';
export type PagesPerView = 1 | 2;

// A spread needs two pages and the gap between them. `full` fills the width
// with one page, so it never spreads.
export const pagesPerView = (
  width: ReadingWidth,
  available: number,
  pageWidth: number,
  gap: number
): PagesPerView =>
  width !== 'full' && available >= 2 * pageWidth + gap ? 2 : 1;

// A short window (a phone held sideways, a zoomed page) could leave no height
// at all, and a zero-height column never fills: the strip would grow columns
// without end. The minimum keeps a page readable instead.
export const pageHeightFor = (
  windowHeight: number,
  top: number,
  reserve: number,
  minimum: number
): number => Math.max(windowHeight - top - reserve, minimum);

// Views start on a multiple of their width, so a spread always shows pages
// 1–2, 3–4 … whatever page it was asked for.
export const clampView = (
  page: number,
  pageCount: number,
  perView: PagesPerView
): number => {
  const last = pageCount - 1;
  const clamped = Math.min(Math.max(page, 0), last);
  return clamped - (clamped % perView);
};

export const hasPage = (
  start: number,
  direction: Direction,
  pageCount: number,
  perView: PagesPerView
): boolean =>
  direction === 'previous' ? start > 0 : start + perView < pageCount;

export const pageIndicator = (
  start: number,
  pageCount: number,
  perView: PagesPerView
): string => {
  const first = start + 1;
  const last = Math.min(start + perView, pageCount);
  return last > first
    ? `Pages ${first}–${last} of ${pageCount}`
    : `Page ${first} of ${pageCount}`;
};

const PAGE_LABELS: Record<Direction, string> = {
  previous: 'Previous page',
  next: 'Next page',
};

const CHAPTER_LABELS: Record<Direction, string> = {
  previous: 'Previous chapter',
  next: 'Next chapter',
};

export const arrowLabel = (
  direction: Direction,
  turnsPage: boolean,
  target: { title: string } | undefined
): string => {
  if (turnsPage) return PAGE_LABELS[direction];
  return target
    ? `${CHAPTER_LABELS[direction]}: ${target.title}`
    : CHAPTER_LABELS[direction];
};

// Book typography marks a paragraph by its first-line indent, so a blank line
// the author typed between paragraphs would only leave an empty indented one.
export const toParagraphs = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: 'previous',
  PageUp: 'previous',
  ArrowRight: 'next',
  PageDown: 'next',
  ' ': 'next',
};

const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

// A modifier means a browser or system shortcut (Alt+← is Back), an editable
// field needs its keys for the caret, and Space on a button presses it.
export const directionForKey = (
  event: Pick<
    KeyboardEvent,
    'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'
  >
): Direction | undefined => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return undefined;
  }
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(EDITABLE)) return undefined;
  if (event.key === ' ' && target?.closest('button, [role="button"]')) {
    return undefined;
  }
  return KEY_DIRECTIONS[event.key];
};

export const directionForClick = (
  x: number,
  left: number,
  width: number
): Direction | undefined => {
  if (width <= 0) return undefined;
  if (x < left + width / 3) return 'previous';
  if (x >= left + (2 * width) / 3) return 'next';
  return undefined;
};

// Router state, never the URL: a reload or a shared link opens page 1.
export const OPEN_ON_LAST_PAGE = { page: 'last' } as const;

export const opensOnLastPage = (state: unknown): boolean =>
  typeof state === 'object' &&
  state !== null &&
  'page' in state &&
  state.page === 'last';
