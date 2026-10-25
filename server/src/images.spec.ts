import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { BadRequestError } from './types/errors.ts';
import {
  processAvatarImage,
  processCoverImage,
  processIllustrationImage,
} from './images.ts';

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

const rejectsBoth = async (input: Buffer): Promise<void> => {
  await assert.rejects(processCoverImage(input), isNotAValidImage);
  await assert.rejects(processAvatarImage(input), isNotAValidImage);
};

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

  await rejectsBoth(truncated);
});

// sharp(buffer) throws synchronously ("Input Buffer is empty") for a 0-byte
// buffer. A PUT with no body still reaches here as Buffer.alloc(0), and
// that must be the same 400 as any other undecodable input, not an
// uncaught error that surfaces as a 500.
test('an empty buffer is refused, not left to crash the caller', async () => {
  await rejectsBoth(Buffer.alloc(0));
});

// A PNG chunk is length, type, data, then CRC32 over type + data.
const pngChunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

// A few dozen bytes that declare width x height RGB 8-bit pixels. The IDAT
// holds one scanline only, so the file is far smaller than it claims.
const declaredPng = (width: number, height: number): Buffer => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.alloc(1 + width * 3))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

test('a PNG declaring 16000x16000 pixels is refused as not a valid image', async () => {
  // Guard only: its truncated IDAT fails to decode even without the limit.
  // The 6000x5000 JPEG test below is what proves the limit.
  const bomb = declaredPng(16000, 16000);
  assert.ok(bomb.length < 2 * 1024 * 1024);

  await rejectsBoth(bomb);
});

test('a real JPEG over 25 megapixels is refused', async () => {
  await rejectsBoth(await solid(6000, 5000, '#336699'));
});

test('a real 20 megapixel JPEG is still accepted', async () => {
  const input = await solid(5000, 4000, '#336699');

  const cover = await sharp(await processCoverImage(input)).metadata();
  const avatar = await sharp(await processAvatarImage(input)).metadata();
  assert.deepEqual([cover.width, cover.height], [600, 900]);
  assert.deepEqual([avatar.width, avatar.height], [256, 256]);
});

test('an Illustration keeps its aspect inside 1600x1600, WebP, no crop (wide)', async () => {
  const output = await processIllustrationImage(
    await solid(3200, 800, '#336699')
  );
  const metadata = await sharp(output.data).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 400);
});

test('an Illustration keeps its aspect inside 1600x1600 (tall)', async () => {
  const metadata = await sharp(
    (await processIllustrationImage(await solid(800, 3200, '#336699'))).data
  ).metadata();
  assert.equal(metadata.width, 400);
  assert.equal(metadata.height, 1600);
});

test('an Illustration smaller than the box is not enlarged', async () => {
  const metadata = await sharp(
    (await processIllustrationImage(await solid(100, 60, '#336699'))).data
  ).metadata();
  assert.equal(metadata.width, 100);
  assert.equal(metadata.height, 60);
});

test('an Illustration result carries the size of its stored bytes', async () => {
  const inputs: [number, number][] = [
    [3200, 800],
    [800, 3200],
    [100, 60],
    [1600, 1600],
    [1601, 1],
    [1, 1],
  ];
  for (const [w, h] of inputs) {
    const result = await processIllustrationImage(await solid(w, h, '#336699'));
    const meta = await sharp(result.data).metadata();
    assert.equal(result.width, meta.width, `${w}x${h} width`);
    assert.equal(result.height, meta.height, `${w}x${h} height`);
  }
});

test('an Illustration result is 1600x400, 400x1600 and 100x60 for the spec inputs', async () => {
  const wide = await processIllustrationImage(
    await solid(3200, 800, '#336699')
  );
  const tall = await processIllustrationImage(
    await solid(800, 3200, '#336699')
  );
  const small = await processIllustrationImage(await solid(100, 60, '#336699'));
  assert.deepEqual([wide.width, wide.height], [1600, 400]);
  assert.deepEqual([tall.width, tall.height], [400, 1600]);
  assert.deepEqual([small.width, small.height], [100, 60]);
});

test('an Illustration refuses bytes that are not an image', async () => {
  await assert.rejects(
    processIllustrationImage(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
    ),
    isNotAValidImage
  );
});
