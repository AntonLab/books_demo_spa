import { illustrationImageUrl } from './illustration';

it('points at the image route and busts the cache with updatedAt', () => {
  const url = illustrationImageUrl({
    id: 5,
    position: 1,
    caption: null,
    updatedAt: '2026-10-17T10:00:00.000Z',
  });
  expect(url).toBe(
    `/api/illustrations/5/image?v=${Date.parse('2026-10-17T10:00:00.000Z')}`
  );
});
