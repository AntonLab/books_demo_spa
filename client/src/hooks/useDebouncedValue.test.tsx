import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns the first value at once', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 250));
    expect(result.current).toBe('a');
  });

  test('holds the old value until 250 ms of quiet, then takes the new one', async () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 250),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    await act(() => jest.advanceTimersByTimeAsync(249));
    expect(result.current).toBe('a');
    await act(() => jest.advanceTimersByTimeAsync(1));
    expect(result.current).toBe('b');
  });

  test('a change inside the window restarts it, so only the last value lands', async () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 250),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    await act(() => jest.advanceTimersByTimeAsync(200));
    rerender({ v: 'c' });
    await act(() => jest.advanceTimersByTimeAsync(200));
    expect(result.current).toBe('a');
    await act(() => jest.advanceTimersByTimeAsync(50));
    expect(result.current).toBe('c');
  });

  test('unmount with a pending timer leaves no timer and no warning', () => {
    const { rerender, unmount } = renderHook(
      ({ v }) => useDebouncedValue(v, 250),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
