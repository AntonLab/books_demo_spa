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
  // How many reverse-proxy hops in front of the API may name the client in
  // X-Forwarded-For — Express's 'trust proxy'. 0 trusts none, so req.ip is
  // the socket's peer. Only a whole, non-negative count is accepted: a hop
  // count is the form that cannot silently trust every address.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // How mail leaves the server: `log` writes every message into the server
  // log, `smtp` sends it through the SMTP_* settings below. Development and
  // test may leave it unset, which logs; production must set it (see
  // parseConfig), because `log` writes live reset links into the log.
  MAIL_DELIVERY: z.enum(['log', 'smtp']).optional(),
  // Read only under MAIL_DELIVERY=smtp, where every one of them but the port
  // is required (mailConfigOf). 587 is the submission port; 465 is implicit
  // TLS, which createSmtpMailDelivery switches on by itself.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: port.default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.email().optional(),
});

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface SmtpMailConfig {
  delivery: 'smtp';
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

export type MailConfig = { delivery: 'log' } | SmtpMailConfig;

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  appBaseUrl: string;
  trustProxy: number;
  mail: MailConfig;
  db: DbConfig;
}

type Env = z.infer<typeof envSchema>;

// The SMTP settings are required together, and only once smtp is chosen, which
// a flat zod object cannot say. Every missing one is named, so a deploy is
// fixed in one round rather than one variable at a time.
function mailConfigOf(env: Env): MailConfig {
  if (env.MAIL_DELIVERY !== 'smtp') return { delivery: 'log' };

  const {
    SMTP_HOST: host,
    SMTP_USER: user,
    SMTP_PASSWORD: password,
    MAIL_FROM: from,
  } = env;
  if (
    host === undefined ||
    user === undefined ||
    password === undefined ||
    from === undefined
  ) {
    const missing = Object.entries({
      SMTP_HOST: host,
      SMTP_USER: user,
      SMTP_PASSWORD: password,
      MAIL_FROM: from,
    })
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);
    throw new Error(
      `Invalid environment configuration — MAIL_DELIVERY: smtp needs ${missing.join(', ')}`
    );
  }

  return { delivery: 'smtp', host, port: env.SMTP_PORT, user, password, from };
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
  if (env.NODE_ENV === 'production' && env.MAIL_DELIVERY === undefined) {
    throw new Error(
      'Invalid environment configuration — MAIL_DELIVERY: production must set MAIL_DELIVERY explicitly; `log` writes password-reset links and notification emails to the server log'
    );
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    appBaseUrl: env.APP_BASE_URL,
    trustProxy: env.TRUST_PROXY,
    mail: mailConfigOf(env),
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
