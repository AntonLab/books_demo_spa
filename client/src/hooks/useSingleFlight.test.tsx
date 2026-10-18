import { renderHook } from '@testing-library/react';
import { useSingleFlight } from './useSingleFlight';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useSingleFlight', () => {
  it('drops a second call while the first has not settled', async () => {
    const first = deferred();
    const fn = jest.fn(() => first.promise);
    const { result } = renderHook(() => useSingleFlight(fn));

    const running = result.current();
    await result.current();
    expect(fn).toHaveBeenCalledTimes(1);

    first.resolve();
    await running;
    await result.current();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  describe('with a key', () => {
    it('drops the same key and lets a different key run', async () => {
      const first = deferred();
      const fn = jest.fn((id: number) =>
        id === 1 ? first.promise : Promise.resolve()
      );
      const { result } = renderHook(() =>
        useSingleFlight(fn, (id: number) => id)
      );

      const running = result.current(1);
      await result.current(1);
      expect(fn).toHaveBeenCalledTimes(1);

      await result.current(2);
      expect(fn).toHaveBeenCalledTimes(2);

      first.resolve();
      await running;
      await result.current(1);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('releases the key when the call rejects', async () => {
      const fn = jest
        .fn<Promise<void>, [number]>()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useSingleFlight(fn, (id: number) => id)
      );

      await expect(result.current(1)).rejects.toThrow('boom');
      await result.current(1);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
