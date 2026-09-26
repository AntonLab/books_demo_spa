import type { ReadingWidth } from '@/store/devicePreferencesSlice';
import { pageHeightFor, pagesPerView } from './pagination';
import type { PagesPerView } from './pagination';

// Every read of the real layout the Pages Reading layout needs. jsdom lays
// nothing out, so tests mock this module and the browser check covers it.

export interface Geometry {
  pageWidth: number;
  pageHeight: number;
  perView: PagesPerView;
  gap: number;
}

export interface PageSizes {
  gap: number;
  // What stays below the pages: the bottom toolbar and the paddings under it.
  reserve: number;
  minHeight: number;
}

// The probe is an empty block capped by the reading width's `max-width` (in
// `ch`, at the reader's font size) inside the whole available width, so its
// width is one page and its parent's is what a spread must fit in. It sits
// right above the pages, so its top is theirs.
export const measureGeometry = (
  probe: HTMLElement,
  width: ReadingWidth,
  { gap, reserve, minHeight }: PageSizes
): Geometry => {
  const page = probe.getBoundingClientRect();
  const available =
    probe.parentElement?.getBoundingClientRect().width ?? page.width;
  return {
    pageWidth: page.width,
    gap,
    perView: pagesPerView(width, available, page.width, gap),
    pageHeight: pageHeightFor(
      window.innerHeight,
      page.top + window.scrollY,
      reserve,
      minHeight
    ),
  };
};

const step = ({ pageWidth, gap }: Geometry) => pageWidth + gap;

// Every fragment starts at a column's left edge, so rounding absorbs subpixel
// widths. Both rects carry the strip's transform, which cancels out.
const pageAt = (strip: HTMLElement, left: number, geometry: Geometry) =>
  Math.round((left - strip.getBoundingClientRect().left) / step(geometry));

// A multi-column box of fixed height grows overflow columns sideways, so its
// own scrollWidth is n pages and n - 1 gaps (its transform does not count).
export const countPages = (strip: HTMLElement, geometry: Geometry): number =>
  Math.max(1, Math.round((strip.scrollWidth + geometry.gap) / step(geometry)));

export const pageOfChild = (
  strip: HTMLElement,
  index: number,
  geometry: Geometry
): number => {
  const first = strip.children[index]?.getClientRects()[0];
  return first ? pageAt(strip, first.left, geometry) : 0;
};

// A paragraph carried over from the page before is the first one visible.
export const childOnPage = (
  strip: HTMLElement,
  page: number,
  geometry: Geometry
): number => {
  const index = Array.from(strip.children).findIndex((child) => {
    const fragments = child.getClientRects();
    const last = fragments[fragments.length - 1];
    return last !== undefined && pageAt(strip, last.left, geometry) >= page;
  });
  return Math.max(index, 0);
};
