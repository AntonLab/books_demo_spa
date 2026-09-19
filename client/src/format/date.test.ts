import { formatDate, formatDateTime } from './date';

// Offset-less ISO strings parse as local time, so these read the same
// calendar day and clock time in whatever time zone the suite runs in — and
// the expected text is English whatever the machine's own locale.
describe('formatDate', () => {
  it('writes a medium English date', () => {
    expect(formatDate('2026-09-18T12:00:00')).toBe('Sep 18, 2026');
  });

  it('writes nothing for a date that does not parse', () => {
    expect(formatDate('not a date')).toBe('');
  });
});

describe('formatDateTime', () => {
  it('adds a short 12-hour time', () => {
    // ICU puts a narrow no-break space before PM; \s matches it.
    expect(formatDateTime('2026-09-18T15:30:00')).toMatch(
      /^Sep 18, 2026, 3:30\sPM$/
    );
  });

  it('writes nothing for a date that does not parse', () => {
    expect(formatDateTime('not a date')).toBe('');
  });
});
