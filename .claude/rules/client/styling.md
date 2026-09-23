---
paths:
  - 'client/src/**/*.module.css'
  - 'client/src/theme/**'
  - 'client/src/index.css'
  - 'client/public/index.html'
---

# Styling (ADR-0009)

- **Styles go in the component's `.module.css`, not `style={{…}}`.** Inline
  `style` is only for values that change continuously at runtime (dnd-kit's
  transform). A boolean state is a modifier class
  (`` `${styles.item} ${fresh ? styles.fresh : ''}` ``). Prefer an antd prop
  (`Flex justify`/`gap`) over a class when one exists.
- **Values come from antd tokens**: `var(--ant-<kebab-name>)` in CSS (in px),
  `theme.useToken()` where a prop needs the number. No arbitrary hex or pixels.
- **A missing token becomes a quark** in `src/theme/tokens.ts`, prefixed `app`
  (antd flattens every token into one object, and an unprefixed name could
  collide with a future antd one), with antd's `AliasToken` augmented in the
  same file so `theme.useToken()` types it. `appBookCoverWidth` becomes
  `var(--ant-app-book-cover-width)`. antd has no width tokens at all.
  `tokens.test.tsx` pins that a custom key survives antd's derivation, which
  its docs do not promise.
- **A class beats antd only because of cascade layers.** `App.tsx` wraps
  everything in `<StyleProvider layer>`, putting antd in `@layer antd`;
  `reset.css` sits in `@layer reset` (`src/index.css`); `public/index.html`
  declares the order before antd injects anything. Without the layer,
  `div.ant-typography` outranks a lone class and a margin silently reverts.
- `css-loader` 7 defaults to `namedExport: true`, which drops the default export
  `import styles from` needs; the webpack rule turns it off.
- Tests see no styles (classes are `undefined`, see `testing.md`): check
  styling in a browser.
