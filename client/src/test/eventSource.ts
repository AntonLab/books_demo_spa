type Listener = (event: Event) => void;

// jsdom implements no EventSource. This fake records every stream a test
// opens and lets the test drive it: `emit` delivers a server event, `fail`
// reports an error the way the browser does (CONNECTING while it retries by
// itself, CLOSED once it has given up).
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  static latest(): FakeEventSource {
    // Not `.at(-1)`: the client's `lib` is ES2020, one short of Array.prototype.at.
    const source =
      FakeEventSource.instances[FakeEventSource.instances.length - 1];
    if (source === undefined) throw new Error('No EventSource was opened');
    return source;
  }

  static reset(): void {
    FakeEventSource.instances = [];
  }

  readonly url: string;
  readonly withCredentials: boolean;
  readyState: number = FakeEventSource.CONNECTING;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string | URL, init?: EventSourceInit) {
    this.url = String(url);
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  // A closed stream receives nothing, as in the browser, so a test can prove
  // that an event sent after close reaches no one.
  emit(type: string, data: unknown): void {
    if (this.readyState === FakeEventSource.CLOSED) return;
    this.readyState = FakeEventSource.OPEN;
    this.dispatch(type, new MessageEvent(type, { data: JSON.stringify(data) }));
  }

  fail(readyState: 0 | 2): void {
    this.readyState = readyState;
    this.dispatch('error', new Event('error'));
  }

  private dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}
