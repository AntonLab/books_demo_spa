// @ts-expect-error - this project ships no @types/node (browser-only
// tsconfig, no "node" lib); the specifier still resolves fine at runtime
// under Jest's Node process.
import { TextDecoder, TextEncoder } from 'node:util';
import '@testing-library/jest-dom';

// jsdom has no Web Encoding API. react-router's package root re-exports its
// server-runtime (cookie signing, etc.) alongside the browser router code we
// actually render, and that code constructs a TextEncoder at module scope —
// so merely importing `react-router` throws before any test body runs unless
// this is polyfilled globally, the same way matchMedia and ResizeObserver are
// below.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  // node:util's TextDecoder is structurally compatible with the DOM one but
  // isn't nominally typed as it, hence the cast.
  globalThis.TextDecoder =
    TextDecoder as unknown as typeof globalThis.TextDecoder;
}

// jsdom implements neither of these, and antd's responsive helpers call both
// during mount. Without them every test that renders an antd component throws
// before reaching its first assertion.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!window.ResizeObserver) {
  window.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}
