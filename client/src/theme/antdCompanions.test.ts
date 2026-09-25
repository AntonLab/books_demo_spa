// `@ant-design/icons` and `@ant-design/cssinjs` are pinned exactly in
// client/package.json while antd asks for a caret range of each (ADR-0009,
// ADR-0012). An antd upgrade that raises either floor past the pin makes npm
// nest a second copy under antd: two icon sets in the bundle, or a
// StyleProvider that antd's own components never see. Bump the pin with antd.
const COMPANIONS = ['@ant-design/icons', '@ant-design/cssinjs'];

// Jest runs this under Node, but the client compiles without Node's types (a
// `/// <reference types="node" />` would leak them into every module), so the
// two globals used here are declared locally.
declare const require: {
  resolve(id: string, options: { paths: string[] }): string;
};
declare const __dirname: string;

const packageDir = (name: string, from: string): string =>
  require
    .resolve(`${name}/package.json`, { paths: [from] })
    .replace(/[\\/]package\.json$/, '');

describe('antd companion packages', () => {
  const antdDir = packageDir('antd', __dirname);

  it.each(COMPANIONS)('%s resolves to the one copy antd uses', (name) => {
    expect(packageDir(name, __dirname)).toBe(packageDir(name, antdDir));
  });
});

export {};
