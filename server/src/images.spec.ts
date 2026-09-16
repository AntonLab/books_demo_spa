import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { BadRequestError } from './types/errors.ts';
import { processAvatarImage, processCoverImage } from './images.ts';

const solid = (
  width: number,
  height: number,
  background: string
): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer();

const isNotAValidImage = (error: unknown): boolean =>
  error instanceof BadRequestError && /not a valid image/i.test(error.message);

test('a Cover comes back as WebP at exactly 600x900 from a wide input', async () => {
  const input = await solid(1200, 400, '#336699');

  const output = await processCoverImage(input);
  const metadata = await sharp(output).metadata();

  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 600);
  assert.equal(metadata.height, 900);
});

test('a Cover comes back at exactly 600x900 from a tall input', async () => {
  const input = await solid(300, 1800, '#336699');

  const metadata = await sharp(await processCoverImage(input)).metadata();

  assert.equal(metadata.width, 600);
  assert.equal(metadata.height, 900);
});

test('a Cover comes back at exactly 600x900 from a tiny input, enlarged rather than refused', async () => {
  const input = await solid(20, 20, '#336699');

  const metadata = await sharp(await processCoverImage(input)).metadata();

  assert.equal(metadata.width, 600);
  assert.equal(metadata.height, 900);
});

test('an Avatar comes back as WebP at exactly 256x256', async () => {
  const input = await solid(800, 300, '#996633');

  const output = await processAvatarImage(input);
  const metadata = await sharp(output).metadata();

  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 256);
  assert.equal(metadata.height, 256);
});

test('EXIF orientation is applied, and every metadata block including GPS is gone', async () => {
  const input = await sharp({
    create: { width: 800, height: 400, channels: 3, background: '#336699' },
  })
    .jpeg()
    .withExif({
      IFD0: { Orientation: '6' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '51/1 30/1 3230/100',
        GPSLongitudeRef: 'W',
        GPSLongitude: '0/1 7/1 4366/100',
      },
    })
    .toBuffer();

  const metadata = await sharp(await processCoverImage(input)).metadata();

  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
});

test('an animated input keeps only its first frame', async () => {
  // Two distinct colours, not the same one twice: sharp's WebP encoder
  // collapses a run of byte-identical frames into a single static image
  // (no ANIM chunk at all), which would make the fixture itself
  // non-animated before processCoverImage ever saw it.
  const frame = (background: string) =>
    sharp({ create: { width: 40, height: 40, channels: 3, background } })
      .png()
      .toBuffer();
  const animated = await sharp(
    [await frame('#663399'), await frame('#339966')],
    { join: { animated: true } }
  )
    .webp()
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);

  const metadata = await sharp(await processCoverImage(animated)).metadata();

  assert.equal(metadata.pages ?? 1, 1);
});

test('an SVG is refused, even under a PNG-shaped call site', async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'
  );

  await assert.rejects(processCoverImage(svg), isNotAValidImage);
});

test('a plain text file is refused', async () => {
  await assert.rejects(
    processCoverImage(Buffer.from('just some text, not an image')),
    isNotAValidImage
  );
});

test('a truncated JPEG is refused', async () => {
  const whole = await solid(400, 400, '#336699');
  const truncated = whole.subarray(0, Math.floor(whole.length / 2));

  await assert.rejects(processCoverImage(truncated), isNotAValidImage);
  await assert.rejects(processAvatarImage(truncated), isNotAValidImage);
});
