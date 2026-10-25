import { tomorrowIso } from './dates';

describe('tomorrowIso', () => {
  afterEach(() => jest.useRealTimers());

  it('is the ISO instant one day after now', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T10:00:00.000Z'));
    expect(tomorrowIso()).toBe('2026-03-02T10:00:00.000Z');
  });

  it('is in the future', () => {
    expect(new Date(tomorrowIso()).getTime()).toBeGreaterThan(Date.now());
  });
});
