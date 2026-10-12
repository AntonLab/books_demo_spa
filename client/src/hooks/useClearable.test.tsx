import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { useClearable } from './useClearable';

const keyEvent = (key: string) => ({ key }) as KeyboardEvent<HTMLDivElement>;

describe('useClearable', () => {
  test.each(['Delete', 'Backspace'])(
    '%s clears a closed select with a value',
    (key) => {
      const onChange = jest.fn();
      const { result } = renderHook(() => useClearable({ value: 3, onChange }));
      act(() => result.current.onKeyDown(keyEvent(key)));
      expect(onChange).toHaveBeenCalledWith(undefined);
    }
  );

  test('clears a value of 0', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useClearable({ value: 0, onChange }));
    act(() => result.current.onKeyDown(keyEvent('Delete')));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test('does not clear while open, clears again after close', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useClearable({ value: 3, onChange }));
    act(() => result.current.onOpenChange(true));
    act(() => result.current.onKeyDown(keyEvent('Delete')));
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.onOpenChange(false));
    act(() => result.current.onKeyDown(keyEvent('Delete')));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test('does not clear without a value', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useClearable({ onChange }));
    act(() => result.current.onKeyDown(keyEvent('Delete')));
    expect(onChange).not.toHaveBeenCalled();
  });

  test.each(['Enter', 'ArrowDown', 'a'])('%s does not clear', (key) => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useClearable({ value: 3, onChange }));
    act(() => result.current.onKeyDown(keyEvent(key)));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('runs the caller handlers, onKeyDown before the clear', () => {
    const order: string[] = [];
    const onKeyDown = jest.fn(() => order.push('keydown'));
    const onChange = jest.fn(() => order.push('change'));
    const onOpenChange = jest.fn();
    const { result } = renderHook(() =>
      useClearable({ value: 3, onChange, onKeyDown, onOpenChange })
    );
    act(() => result.current.onOpenChange(true));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    act(() => result.current.onOpenChange(false));
    act(() => result.current.onKeyDown(keyEvent('Backspace')));
    expect(order).toEqual(['keydown', 'change']);
  });

  test('works with no caller handlers', () => {
    const { result } = renderHook(() => useClearable({ value: 3 }));
    act(() => result.current.onOpenChange(true));
    act(() => result.current.onOpenChange(false));
    expect(() =>
      act(() => result.current.onKeyDown(keyEvent('Delete')))
    ).not.toThrow();
  });

  test('returns allowClear and a className', () => {
    const { result } = renderHook(() => useClearable({}));
    expect(result.current.allowClear).toBe(true);
    expect('className' in result.current).toBe(true);
  });
});
