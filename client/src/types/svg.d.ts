// webpack's `asset/resource` rule turns an `.svg` import into its URL; Jest
// maps it to `src/test/fileMock.ts`.
declare module '*.svg' {
  const url: string;
  export default url;
}
