# Icons come from Font Awesome, not @ant-design/icons

Superseded by ADR-0012.

The client draws its icons with Font Awesome's SVG packages
(`@fortawesome/react-fontawesome`, `@fortawesome/fontawesome-svg-core`,
`@fortawesome/free-solid-svg-icons`), imported one icon at a time so only the
icons in use reach the bundle. `@ant-design/icons` is antd's own set and the
obvious choice beside antd, but we picked Font Awesome for three reasons: its
free set is wider, the team already knows it from other projects, and it ties
the icons to no UI library, so they survive if antd is ever replaced.

## Consequences

- `@ant-design/icons` stays out of the dependencies. An antd prop that expects
  an icon takes a `<FontAwesomeIcon>` like any other `ReactNode`.
- No webfont and no CSS kit: `fontawesome-svg-core` injects its own small
  stylesheet for `.svg-inline--fa`, which touches no antd class.
