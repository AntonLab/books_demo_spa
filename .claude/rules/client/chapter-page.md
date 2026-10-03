---
paths:
  - 'client/src/pages/ChapterPage/**'
---

# ChapterPage

- `ChapterPage` applies the reading Device preferences: background and font
  through a nested `ConfigProvider` (a class overriding `--ant-*` never
  reaches antd's components, which redeclare them), size and line height
  inline on the text column, whose `ch` width is measured at that size. In
  Scroll its arrows are antd `Button`s with `href`, routed in-app on a plain
  click, and stay disabled rather than vanish at either end.
- The Pages Reading layout lives beside the page: rules in `pagination.ts`,
  every layout read in `measurePages.ts` (mocked in Jest; jsdom lays nothing
  out, so check pages, spreads and the slide in a browser), state in
  `usePages.ts`. The strip is CSS multi-column with a fixed height, so its
  overflow columns are the pages. A relayout re-measures, then shows the page
  where the paragraph that was on top begins. That paragraph is recorded only
  on an open or a turn, never after a relayout (it would then be the one
  carried over from the page before, and every resize would step back a
  page), and a resize that changes no page size keeps the old geometry. The
  page stays mounted
  between chapters, so `usePages` resets its view during render when the
  chapter id changes. "Open on the last page" is `location.state`, replaced
  with `null` once read, or a reload would reopen there. In Pages the arrows
  are plain buttons whose label changes, so focus stays on one as it turns
  pages; a hand-off to a chapter not yet cached shows the skeleton, which
  drops focus. `ReadingPreferences` reports closed on unmount, or the page's
  keys stay off after that skeleton. The window clips with `overflow: clip`: a `hidden` box can be
  scrolled by find-in-page. Destructure `usePages`'s result: `react-hooks/refs`
  reads any property of an object holding refs as a ref read during render.
