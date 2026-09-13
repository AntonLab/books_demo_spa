import { createHash, randomBytes, createHmac } from 'node:crypto';

// 32 bytes = 256 bits. Base64url so the value is safe in a cookie and in a
// reset URL's query string without escaping.
const TOKEN_BYTES = 32;

export function createToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

// SHA-256, deliberately not argon2. argon2 is slow by design to make
// low-entropy passwords expensive to guess; a 256-bit random token cannot be
// guessed at any speed, so that cost buys nothing — and a session token is
// verified on every authenticated request, where argon2's ~19 MiB working set
// would be a self-inflicted denial of service. Hashing at rest still matters:
// a leaked database dump must not hand over usable sessions.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// A session's XSRF token: an HMAC keyed by the session token itself, so no
// second secret is needed and nobody without the httpOnly session cookie can
// compute it. A token planted by a sibling subdomain names some other session
// and is refused (middleware/csrfProtection.ts).
export function xsrfTokenFor(sessionToken: string): string {
  return createHmac('sha256', sessionToken).update('xsrf').digest('base64url');
}
