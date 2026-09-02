import '@testing-library/jest-dom';

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
