import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: port.default(4000),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: port.default(3306),
  DB_NAME: z.string().min(1).default('books_demo_spa'),
  // No defaults for the credentials on purpose: a root/root fallback would let
  // the server start against an unintended database, and the mistake would
  // surface later as confusing data instead of immediately as a config error.
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  // Validated as a URL rather than a bare string: a malformed origin here would
  // not surface until a reset link was built from it, in an email nobody can
  // fix. The default is the webpack dev server the client runs on.
  APP_BASE_URL: z.url().default('http://localhost:3000'),
});

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  appBaseUrl: string;
  db: DbConfig;
}

export function parseConfig(source: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${details}`);
  }

  const env = result.data;
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    appBaseUrl: env.APP_BASE_URL,
    db: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      username: env.DB_USER,
      password: env.DB_PASSWORD,
    },
  };
}

export function loadConfig(): AppConfig {
  return parseConfig(process.env);
}
