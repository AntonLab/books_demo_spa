import dayjs from 'dayjs';
import { dayRange } from './reportRange';

describe('dayRange', () => {
  it('runs from the start of the first local day to the start of the day after the last', () => {
    const { from, to } = dayRange(
      dayjs(new Date(2026, 9, 3, 15, 30)),
      dayjs(new Date(2026, 9, 5, 9))
    );
    expect(from).toBe(new Date(2026, 9, 3).toISOString());
    expect(to).toBe(new Date(2026, 9, 6).toISOString());
  });

  it('makes a single day one local day long, DST changes included', () => {
    const day = dayjs(new Date(2026, 2, 8, 12));
    expect(dayRange(day, day).to).toBe(new Date(2026, 2, 9).toISOString());
  });
});
