import { LAST_ONLINE_WINDOW_MS } from 'shared';
import { lastOnlineLabel } from './lastOnline';

const now = new Date(2026, 9, 3, 12, 0, 0);
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('lastOnlineLabel', () => {
  it('is null with no stamp', () => {
    expect(lastOnlineLabel(null, now)).toBeNull();
  });

  it('says Online now strictly inside the window, and not at its edge', () => {
    expect(lastOnlineLabel(ago(LAST_ONLINE_WINDOW_MS - 1000), now)).toBe(
      'Online now'
    );
    expect(lastOnlineLabel(ago(LAST_ONLINE_WINDOW_MS), now)).toBe(
      'Last online today'
    );
  });

  it('treats a stamp ahead of the clock as Online now', () => {
    expect(lastOnlineLabel(ago(-60_000), now)).toBe('Online now');
  });

  it('says today for an earlier time on the same local day', () => {
    expect(lastOnlineLabel(new Date(2026, 9, 3, 0, 1).toISOString(), now)).toBe(
      'Last online today'
    );
  });

  it('says yesterday across local midnight', () => {
    expect(
      lastOnlineLabel(new Date(2026, 9, 2, 23, 59).toISOString(), now)
    ).toBe('Last online yesterday');
    const justAfterMidnight = new Date(2026, 9, 3, 0, 2);
    expect(
      lastOnlineLabel(
        new Date(2026, 9, 2, 23, 59).toISOString(),
        justAfterMidnight
      )
    ).toBe('Online now');
  });

  it('gives the medium date for anything older', () => {
    expect(lastOnlineLabel(new Date(2026, 9, 1, 9, 0).toISOString(), now)).toBe(
      'Last online Oct 1, 2026'
    );
  });

  it('is null for an unparsable stamp', () => {
    expect(lastOnlineLabel('nope', now)).toBeNull();
  });
});
