// Ambient module for CSS side-effect imports (e.g. `antd/dist/reset.css` in
// `src/index.tsx`). webpack's style-loader/mini-css-extract-plugin handle the
// import at build time and Jest maps it to `src/test/styleMock.ts`; without
// this declaration TypeScript has no type for the module at all.
declare module '*.css';
