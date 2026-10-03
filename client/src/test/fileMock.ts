// Jest cannot load an SVG. webpack resolves an `.svg` import to a URL string,
// so every `.svg` import is mapped here instead (see moduleNameMapper).
export default 'header.svg';
