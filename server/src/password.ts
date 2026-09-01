import { Algorithm, hash, verify } from '@node-rs/argon2';

export interface PasswordParams {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

// The OWASP argon2id baseline: 19 MiB, two iterations, one lane.
const DEFAULT_PARAMS: PasswordParams = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// Deliberately weak, for tests only. A suite that creates dozens of users would
// otherwise spend seconds inside the KDF by design.
const TEST_PARAMS: PasswordParams = {
  memoryCost: 512,
  timeCost: 1,
  parallelism: 1,
};

export function passwordParams(env: string): PasswordParams {
  return env === 'test' ? { ...TEST_PARAMS } : { ...DEFAULT_PARAMS };
}

export async function hashPassword(
  plaintext: string,
  env: string = process.env.NODE_ENV ?? 'development'
): Promise<string> {
  return hash(plaintext, {
    algorithm: Algorithm.Argon2id,
    ...passwordParams(env),
  });
}

export async function verifyPassword(
  hashed: string,
  plaintext: string
): Promise<boolean> {
  return verify(hashed, plaintext);
}
