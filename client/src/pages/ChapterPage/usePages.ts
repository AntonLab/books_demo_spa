import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { theme } from 'antd';
import type { ReadingPreferences } from '@/store/devicePreferencesSlice';
import {
  childOnPage,
  countPages,
  measureGeometry,
  pageOfChild,
} from './measurePages';
import type { Geometry } from './measurePages';
import { clampView, hasPage } from './pagination';
import type { Direction, PagesPerView } from './pagination';

export interface UsePagesOptions {
  // Only the Pages Reading layout measures anything.
  enabled: boolean;
  chapterId: number;
  // `undefined` while the chapter loads: nothing to lay out yet.
  text: string | undefined;
  reading: ReadingPreferences;
  openOnLastPage: boolean;
}

export interface Pages {
  probeRef: RefObject<HTMLDivElement | null>;
  stripRef: RefObject<HTMLDivElement | null>;
  // The first page shown, 0-based.
  start: number;
  pageCount: number;
  perView: PagesPerView;
  animate: boolean;
  windowStyle: CSSProperties | undefined;
  stripStyle: CSSProperties | undefined;
  hasPage: (direction: Direction) => boolean;
  turn: (direction: Direction) => void;
}

// `anchor` is every settle after the first: the page shown follows the
// paragraph that was at its top.
type OpenAt = 'first' | 'last' | 'anchor';

interface View {
  chapterId: number;
  openAt: OpenAt;
  start: number;
  pageCount: number;
  animate: boolean;
}

const openedView = (chapterId: number, openOnLastPage: boolean): View => ({
  chapterId,
  openAt: openOnLastPage ? 'last' : 'first',
  start: 0,
  pageCount: 1,
  animate: false,
});

export const usePages = ({
  enabled,
  chapterId,
  text,
  reading,
  openOnLastPage,
}: UsePagesOptions): Pages => {
  const { token } = theme.useToken();
  const probeRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  // The strip child at the top of the page shown, recorded after each settle
  // so a relayout can find it again.
  const anchorRef = useRef(0);
  const [geometry, setGeometry] = useState<Geometry>();
  const [view, setView] = useState(() => openedView(chapterId, openOnLastPage));

  // The route keeps this page mounted from one chapter to the next. Resetting
  // during render, not in an effect, means the old chapter's page is never
  // painted over the new text.
  if (view.chapterId !== chapterId) {
    setView(openedView(chapterId, openOnLastPage));
  }

  const { font, fontSize, lineHeight, width } = reading;
  const gap = token.marginXL;
  const reserve =
    token.controlHeightLG + 2 * token.margin + 2 * token.paddingLG;
  const minHeight = fontSize * lineHeight * 4;

  // `text` and `font` are not read here, but either one reflows the strip,
  // and a fresh geometry object is what makes phase B count the pages again.
  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!enabled || !probe) return;
    const measure = () =>
      setGeometry(measureGeometry(probe, width, { gap, reserve, minHeight }));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [
    enabled,
    text,
    font,
    fontSize,
    lineHeight,
    width,
    gap,
    reserve,
    minHeight,
  ]);

  const settle = useEffectEvent((measured: Geometry) => {
    const strip = stripRef.current;
    if (!strip) return;
    const pageCount = countPages(strip, measured);
    const page =
      view.openAt === 'last'
        ? pageCount - 1
        : view.openAt === 'first'
          ? 0
          : pageOfChild(strip, anchorRef.current, measured);
    setView({
      ...view,
      openAt: 'anchor',
      pageCount,
      start: clampView(page, pageCount, measured.perView),
      animate: false,
    });
  });

  useLayoutEffect(() => {
    if (geometry) settle(geometry);
  }, [geometry]);

  // After phase B on purpose: in the commit that brings a new geometry,
  // phase B must still read the anchor recorded under the old one.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!geometry || !strip) return;
    anchorRef.current = childOnPage(strip, view.start, geometry);
  }, [geometry, view.start]);

  const perView = geometry?.perView ?? 1;
  const offset = geometry
    ? view.start * (geometry.pageWidth + geometry.gap)
    : 0;

  return {
    probeRef,
    stripRef,
    start: view.start,
    pageCount: view.pageCount,
    perView,
    animate: view.animate,
    windowStyle: geometry && {
      width: perView * geometry.pageWidth + (perView - 1) * geometry.gap,
      height: geometry.pageHeight,
    },
    stripStyle: geometry && {
      columnCount: perView,
      columnGap: geometry.gap,
      transform: `translateX(${-offset}px)`,
    },
    hasPage: (direction) =>
      hasPage(view.start, direction, view.pageCount, perView),
    turn: (direction) =>
      setView((current) => ({
        ...current,
        animate: true,
        start: clampView(
          current.start + (direction === 'next' ? perView : -perView),
          current.pageCount,
          perView
        ),
      })),
  };
};
