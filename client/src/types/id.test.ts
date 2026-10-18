import { isId } from './id';

describe('isId', () => {
  it.each([1, 2, 9007199254740991])('accepts the positive integer %s', (n) => {
    expect(isId(n)).toBe(true);
  });

  it.each([0, -1, 1.5, NaN, Infinity])('refuses %s', (n) => {
    expect(isId(n)).toBe(false);
  });
});
