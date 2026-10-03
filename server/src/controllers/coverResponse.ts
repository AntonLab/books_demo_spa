import type { Response } from 'express';

export function sendCover(res: Response, cover: { data: Buffer }): void {
  res
    .status(200)
    .set({
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
      // Versioned by the URL's own ?v=, so immutable is safe.
      'Cache-Control': 'private, max-age=31536000, immutable',
    })
    .send(cover.data);
}
