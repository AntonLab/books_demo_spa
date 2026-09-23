# Components style through CSS Modules, with antd in a cascade layer

A component's styles live in its own `.module.css` and read design tokens as
the CSS variables antd 6 emits for every token, ours included
(`var(--ant-margin)`, `var(--ant-app-book-cover-width)`). Inline `style` is
kept only for values that change continuously at runtime, such as the
transform dnd-kit recomputes on every pointer move. Before this, every
component read `theme.useToken()` and passed the values through `style={{…}}`,
which kept tokens typed but filled the JSX with layout noise.

A lone class loses to some of antd's own selectors: Typography styles
`div.ant-typography` and `h2.ant-typography`, one element and one class, where
our rule has only the class. Inline styles never had this problem, so moving
to classes needed a way to win the cascade. We chose `<StyleProvider layer>`,
the approach antd's "compatible style" guide documents: antd's styles go into
`@layer antd`, and every unlayered stylesheet outranks every layer regardless
of specificity. We rejected raising specificity per rule (`div.text`,
`.text.text`), because it depends on antd's internal selectors and the next
class put on a Typography would silently lose again. We also rejected keeping
Typography margins inline as a standing exception.

## Consequences

- `@ant-design/cssinjs` is a direct dependency of `client`, pinned to the
  version antd itself requires; the two must move together.
- `antd/dist/reset.css` is imported into `@layer reset` (`src/index.css`).
  Left unlayered it would outrank antd's layered component styles.
- Cascade layer order is fixed by the first stylesheet that names a layer, and
  antd injects its styles at the top of `<head>`. `public/index.html`
  therefore declares `@layer reset, antd;` in a `<style>` marked
  `data-rc-order="prepend"`, which rc-util queues antd's own styles after.
  This relies on rc-util's insertion order rather than on antd's documented
  API, so an antd upgrade should be checked in a browser.
- Tests render with `zeroRuntime` and map every `.css` import to a stub, so no
  test can see a style. Styling is verified in a browser, not in Jest.
