# Icons come from @ant-design/icons, replacing Font Awesome

Supersedes ADR-0011. The client drew eight icons in three files with three
Font Awesome packages, while `@ant-design/icons` was already in the tree as a
dependency of antd itself. The reasons ADR-0011 gave did not hold up at this
size: a wider free set buys nothing when antd's set covers every icon in use,
and replacing antd would rewrite every component anyway, so icons that
survive the swap save little. We now import antd's icons one at a time
(`SettingOutlined`, `ArrowLeftOutlined`, …) and dropped all three
`@fortawesome/*` packages.

## Consequences

- `@ant-design/icons` is a direct dependency of `client`, pinned to the
  version antd requires; the two move together, like `@ant-design/cssinjs`
  (ADR-0009).
- An antd icon is not decorative by default: it renders `role="img"` with the
  icon's name as `aria-label`. On a button labelled by its own `aria-label`
  that name is overridden and harmless. Beside visible text it would join the
  button's name ("unordered-list Contents"), so there the icon takes
  `aria-hidden`.
