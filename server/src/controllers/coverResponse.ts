import type { Response } from 'express';

export function sendCover(res: Response, cover: { data: Buffer }): void {
  res
    .status(200)
    .set({
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
      // Immutable is safe: a Cover URL carries `?v=`, an Illustration URL its never-replaced id.
      'Cache-Control': 'private, max-age=31536000, immutable',
    })
    .send(cover.data);
}
