# Hash session and reset tokens with SHA-256, not argon2

Session and password-reset tokens are opaque 256-bit random values, verified on every
authenticated request — unlike a password, they cannot be guessed at any speed, so
argon2's deliberate slowness buys no security and its ~19 MiB working set would turn
every request into a self-inflicted denial of service. We hash them with SHA-256
instead: fast enough for per-request verification, while still ensuring a leaked
database dump does not hand over usable sessions (only the hash is stored; the
plaintext lives in the cookie and the reset link only).
