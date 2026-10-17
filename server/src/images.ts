import sharp, { type Sharp } from 'sharp';
import { BadRequestError } from './types/errors.ts';

// Every sharp call for a Cover or an Avatar lives here, one function each.
// The input-pixel limit is set explicitly. sharp's default (about 268 MP) lets
// a tiny PNG declaring 16000x16000 through, costing about 1 GB of RAM to
// decode. The largest output is 600x900, and 25 MP still admits a 6000x4000
// photo. Multi-page input reads only its first frame (sharp default).
const MAX_INPUT_PIXELS = 25_000_000;
const DECODABLE_FORMATS = new Set(['jpeg', 'png', 'webp']);

async function decode(buffer: Buffer): Promise<Sharp> {
  // sharp(buffer) itself throws synchronously for input it rejects outright
  // (an empty buffer's "Input Buffer is empty" included), so the constructor
  // call has to sit inside the same try as metadata() — otherwise that throw
  // reaches the caller as sharp's own error instead of this function's 400.
  let image: Sharp;
  let format: string | undefined;
  try {
    image = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS });
    ({ format } = await image.metadata());
  } catch {
    throw new BadRequestError('Not a valid image');
  }
  if (!format || !DECODABLE_FORMATS.has(format)) {
    throw new BadRequestError('Not a valid image');
  }
  return image;
}

// The upload's bytes are discarded; only this re-encoded buffer is stored.
// .webp() carries no metadata unless .withMetadata() is called, which this
// never does.
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

// A Cover: 600x900.
export function processCoverImage(buffer: Buffer): Promise<Buffer> {
  return reencode(buffer, 600, 900);
}

// An Avatar: 256x256, square wherever it appears.
export function processAvatarImage(buffer: Buffer): Promise<Buffer> {
  return reencode(buffer, 256, 256);
}
