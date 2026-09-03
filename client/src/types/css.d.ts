// A CSS Module resolves to its class-name map — the default export
// `css-loader` produces when `modules` is on. Declared before the bare
// `*.css` below because it is the more specific pattern.
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

// Ambient module for CSS side-effect imports (e.g. `antd/dist/reset.css` in
// `src/index.tsx`). webpack's style-loader/mini-css-extract-plugin handle the
// import at build time and Jest maps it to `src/test/styleMock.ts`; without
// this declaration TypeScript has no type for the module at all.
declare module '*.css';
