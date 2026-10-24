import { chapterStateOf } from './chapter';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');

describe('chapterStateOf', () => {
  it.each([
    ['no time', null, 'draft'],
    ['one ms ahead', '2026-09-24T12:00:00.001Z', 'scheduled'],
    ['exactly now', '2026-09-24T12:00:00.000Z', 'published'],
    ['one ms ago', '2026-09-24T11:59:59.999Z', 'published'],
    ['far past', '2020-01-01T00:00:00.000Z', 'published'],
    ['far future', '2099-01-01T00:00:00.000Z', 'scheduled'],
  ])('%s', (_name, publishedAt, expected) => {
    expect(chapterStateOf({ publishedAt }, NOW)).toBe(expected);
  });
});
