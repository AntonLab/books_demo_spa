import sharp, { type Sharp } from 'sharp';
import { BadRequestError } from './types/errors.ts';

// Every sharp call for a Cover or an Avatar lives here, one function each.
// sharp's own defaults do most of the refusing for us — the input-pixel
// limit stays on and multi-page input reads only its first frame — so
// nothing here turns either off.
const DECODABLE_FORMATS = new Set(['jpeg', 'png', 'webp']);

async function decode(buffer: Buffer): Promise<Sharp> {
  // sharp(buffer) itself throws synchronously for input it rejects outright
  // (an empty buffer's "Input Buffer is empty" included), so the constructor
  // call has to sit inside the same try as metadata() — otherwise that throw
  // reaches the caller as sharp's own error instead of this function's 400.
  let image: Sharp;
  let format: string | undefined;
  try {
    image = sharp(buffer);
    ({ format } = await image.metadata());
  } catch {
    throw new BadRequestError('Not a valid image');
  }
  if (!format || !DECODABLE_FORMATS.has(format)) {
    throw new BadRequestError('Not a valid image');
  }
  return image;
}

// EXIF orientation applied then dropped (autoOrient), centre-cropped to
// fill the frame (fit: 'cover', the default position), encoded as WebP with
// no metadata — .webp() carries none unless .withMetadata() is called,
// which this never does. The uploaded bytes themselves are discarded: only
// this re-encoded buffer is ever stored.
async function reencode(
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  const image = await decode(buffer);
  try {
    return await image
      .autoOrient()
      .resize(width, height, { fit: 'cover' })
      .webp()
      .toBuffer();
  } catch {
    throw new BadRequestError('Not a valid image');
  }
}

// A Cover: 600x900 (CONTEXT.md).
export function processCoverImage(buffer: Buffer): Promise<Buffer> {
  return reencode(buffer, 600, 900);
}

// An Avatar: 256x256 (CONTEXT.md), square wherever it appears.
export function processAvatarImage(buffer: Buffer): Promise<Buffer> {
  return reencode(buffer, 256, 256);
}
