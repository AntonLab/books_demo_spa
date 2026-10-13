// A reset request answers before its detached lookup and token work run; a
// test that reads what they did waits one macrotask first.
export const flushDetached = () =>
  new Promise<void>((resolve) => setImmediate(resolve));
