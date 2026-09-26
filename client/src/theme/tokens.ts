import type { ThemeConfig } from 'antd';

// Quarks: the design tokens the whole app reads — as CSS variables in a
// `.module.css` (`appBookCoverWidth` is `var(--ant-app-book-cover-width)`),
// or through `theme.useToken()` where a component prop needs the number.
//
// antd 6 ships no token for how wide a control may grow — its size tokens
// cover spacing, typography, radii and control *height* only (see
// `AliasToken`, which has `controlHeight` but nothing for width). Atomic
// Design rule 4 says a value like that becomes a real quark rather than a
// literal in a component, so it is declared here and merged into antd's own
// token set below.
//
// The `app` prefix keeps our quarks out of antd's namespace: antd derives its
// tokens into the same flat object, so an unprefixed name could collide with
// one a future antd version adds.
declare module 'antd/es/theme/interface' {
  interface AliasToken {
    /** Widest the header's search field is allowed to grow. */
    appSearchBarMaxWidth: number;
    /** Width of the notification bell's panel. */
    appNotificationPanelWidth: number;
    /** Width of a BookCover frame; its height is 1.5x this (a 2:3 ratio). */
    appBookCoverWidth: number;
    /** Height of BookPage's tab panel, sized to Statistics; longer ones scroll. */
    appBookTabsHeight: number;
    /** Tallest the replied-to Comment grows in the composer before it scrolls. */
    appCommentQuoteMaxHeight: number;
    /** Width of the page's content column (header and route): a CSS length. */
    appPageWidth: string;
    /** Widest a Chapter's text column grows at each reading width: CSS lengths. */
    appReadingWidthNarrow: string;
    appReadingWidthMedium: string;
    appReadingWidthWide: string;
  }
}

// A Chapter's reading backgrounds, fed as tokens to a ConfigProvider around the
// text rather than as CSS: antd redeclares its `--ant-*` variables on every
// component it renders, so a class overriding them on an ancestor never
// reaches a Typography inside. `auto` has none: it keeps the app's theme.
export const READING_PALETTES = {
  white: { background: '#ffffff', text: 'rgba(0, 0, 0, 0.88)' },
  sepia: { background: '#f4ecd8', text: '#5b4636' },
  dark: { background: '#2b2b2b', text: '#d4d4d4' },
  black: { background: '#000000', text: '#b3b3b3' },
} as const;

// `sans` keeps antd's own stack.
export const READING_SERIF_FONT = "Georgia, 'Times New Roman', Times, serif";

export const appTheme: ThemeConfig = {
  token: {
    appSearchBarMaxWidth: 400,
    appNotificationPanelWidth: 360,
    appBookCoverWidth: 96,
    appBookTabsHeight: 218,
    appCommentQuoteMaxHeight: 160,
    // A share of the window, kept between a floor and a ceiling. The `%`
    // resolves where the variable is used, against the Layout's full width.
    appPageWidth: 'clamp(1024px, 75%, 1440px)',
    // In characters, so the line length holds at every font size.
    appReadingWidthNarrow: '50ch',
    appReadingWidthMedium: '65ch',
    appReadingWidthWide: '80ch',
  },
};
