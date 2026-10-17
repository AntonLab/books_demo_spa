import { illustrationImageUrl } from './illustration';

it('points at the image route by id alone, so a caption save keeps the URL', () => {
  const item = {
    id: 5,
    position: 1,
    caption: null,
    updatedAt: '2026-10-17T10:00:00.000Z',
  };
  const saved = {
    ...item,
    caption: 'Edited',
    updatedAt: '2026-10-17T11:00:00.000Z',
  };
  expect(illustrationImageUrl(item)).toBe('/api/illustrations/5/image');
  expect(illustrationImageUrl(saved)).toBe(illustrationImageUrl(item));
});
