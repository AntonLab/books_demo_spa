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

// jsdom implements no MessageChannel. antd's Form (via @rc-component/form's
// watch mechanism) constructs one unconditionally on every field mount to
// schedule a macrotask, so without this polyfill mounting any Form-based
// component throws before the first assertion. Node's own `worker_threads`
// export would work too, but it opens a real native async handle that
// outlives the test and makes Jest force-exit its worker; this fake only
// uses `setTimeout`, which does not.
class FakeMessagePort {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  private peer: FakeMessagePort | null = null;

  link(peer: FakeMessagePort): void {
    this.peer = peer;
  }

  postMessage(data?: unknown): void {
    const peer = this.peer;
    setTimeout(() => peer?.onmessage?.({ data }), 0);
  }

  close(): void {}
}

class FakeMessageChannel {
  readonly port1 = new FakeMessagePort();
  readonly port2 = new FakeMessagePort();

  constructor() {
    this.port1.link(this.port2);
    this.port2.link(this.port1);
  }
}

if (typeof globalThis.MessageChannel === 'undefined') {
  globalThis.MessageChannel =
    FakeMessageChannel as unknown as typeof globalThis.MessageChannel;
}
