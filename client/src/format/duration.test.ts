import { formatDuration } from './duration';

describe('formatDuration', () => {
  it.each([
    [null, '—'],
    [0, '< 1 min'],
    [59, '< 1 min'],
    [60, '1 min'],
    [119, '1 min'],
    [3540, '59 min'],
    [3600, '1 h'],
    [5400, '1 h 30 min'],
    [86399, '23 h 59 min'],
    [86400, '1 d'],
    [90000, '1 d 1 h'],
  ])('formats %p as %p', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
