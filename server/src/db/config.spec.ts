import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from './config.ts';

const minimal = { DB_USER: 'root', DB_PASSWORD: 'secret' };

test('applies defaults for host, port, database, env and app port', () => {
  const config = parseConfig({ ...minimal });

  assert.equal(config.db.host, '127.0.0.1');
  assert.equal(config.db.port, 3306);
  assert.equal(config.db.database, 'books_demo_spa');
  assert.equal(config.env, 'development');
  assert.equal(config.port, 4000);
});

test('carries the supplied credentials through', () => {
  const config = parseConfig({ ...minimal });

  assert.equal(config.db.username, 'root');
  assert.equal(config.db.password, 'secret');
});

test('accepts an empty password but not a missing one', () => {
  assert.equal(
    parseConfig({ DB_USER: 'root', DB_PASSWORD: '' }).db.password,
    ''
  );
  assert.throws(() => parseConfig({ DB_USER: 'root' }), /DB_PASSWORD/);
});

test('rejects a missing user rather than defaulting to root', () => {
  assert.throws(() => parseConfig({ DB_PASSWORD: 'secret' }), /DB_USER/);
});

test('coerces numeric variables and rejects nonsense', () => {
  assert.equal(parseConfig({ ...minimal, DB_PORT: '3307' }).db.port, 3307);
  assert.throws(() => parseConfig({ ...minimal, DB_PORT: 'abc' }), /DB_PORT/);
  assert.throws(() => parseConfig({ ...minimal, DB_PORT: '70000' }), /DB_PORT/);
});

test('rejects an unknown NODE_ENV', () => {
  assert.throws(
    () => parseConfig({ ...minimal, NODE_ENV: 'staging' }),
    /NODE_ENV/
  );
});

test('APP_BASE_URL defaults to the webpack dev server origin', () => {
  const config = parseConfig({ DB_USER: 'u', DB_PASSWORD: 'p' });
  assert.equal(config.appBaseUrl, 'http://localhost:3000');
});

test('APP_BASE_URL is taken from the environment when set', () => {
  const config = parseConfig({
    DB_USER: 'u',
    DB_PASSWORD: 'p',
    APP_BASE_URL: 'https://books.example.com',
  });
  assert.equal(config.appBaseUrl, 'https://books.example.com');
});

test('a malformed APP_BASE_URL is a config error, not a broken link later', () => {
  assert.throws(() =>
    parseConfig({ DB_USER: 'u', DB_PASSWORD: 'p', APP_BASE_URL: 'not-a-url' })
  );
});

test('TRUST_PROXY defaults to 0, trusting no proxy', () => {
  assert.equal(parseConfig({ ...minimal }).trustProxy, 0);
});

test('TRUST_PROXY takes a whole number of proxy hops', () => {
  assert.equal(parseConfig({ ...minimal, TRUST_PROXY: '2' }).trustProxy, 2);
});

test('TRUST_PROXY refuses a negative, fractional or non-numeric value', () => {
  for (const value of ['-1', '1.5', 'yes']) {
    assert.throws(
      () => parseConfig({ ...minimal, TRUST_PROXY: value }),
      /TRUST_PROXY/
    );
  }
});

const SMTP = {
  MAIL_DELIVERY: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'mailer',
  SMTP_PASSWORD: 'mailer-secret',
  MAIL_FROM: 'noreply@example.com',
};

test('MAIL_DELIVERY may be left unset in development and test, and then logs', () => {
  assert.deepEqual(parseConfig({ ...minimal }).mail, { delivery: 'log' });
  assert.deepEqual(parseConfig({ ...minimal, NODE_ENV: 'test' }).mail, {
    delivery: 'log',
  });
});

test('production without MAIL_DELIVERY is a config error that says what log does', () => {
  assert.throws(
    () => parseConfig({ ...minimal, NODE_ENV: 'production' }),
    /MAIL_DELIVERY: production must set MAIL_DELIVERY explicitly; `log` writes password-reset links and notification emails to the server log/
  );
});

test('production accepts MAIL_DELIVERY=log once it is set explicitly', () => {
  assert.deepEqual(
    parseConfig({ ...minimal, NODE_ENV: 'production', MAIL_DELIVERY: 'log' })
      .mail,
    { delivery: 'log' }
  );
});

test('MAIL_DELIVERY refuses a delivery that does not exist', () => {
  assert.throws(
    () => parseConfig({ ...minimal, MAIL_DELIVERY: 'email' }),
    /MAIL_DELIVERY/
  );
});

test('MAIL_DELIVERY=smtp carries the SMTP settings, on port 587 unless SMTP_PORT says otherwise', () => {
  assert.deepEqual(parseConfig({ ...minimal, ...SMTP }).mail, {
    delivery: 'smtp',
    host: 'smtp.example.com',
    port: 587,
    user: 'mailer',
    password: 'mailer-secret',
    from: 'noreply@example.com',
  });
  const mail = parseConfig({ ...minimal, ...SMTP, SMTP_PORT: '465' }).mail;
  assert.equal(mail.delivery === 'smtp' ? mail.port : null, 465);
});

test('MAIL_DELIVERY=smtp names every SMTP setting it is missing', () => {
  assert.throws(
    () =>
      parseConfig({
        ...minimal,
        MAIL_DELIVERY: 'smtp',
        SMTP_HOST: 'smtp.example.com',
      }),
    /MAIL_DELIVERY: smtp needs SMTP_USER, SMTP_PASSWORD, MAIL_FROM/
  );
});

test('MAIL_FROM must be an email address', () => {
  assert.throws(
    () => parseConfig({ ...minimal, ...SMTP, MAIL_FROM: 'nobody' }),
    /MAIL_FROM/
  );
});

test('the SMTP settings are ignored while MAIL_DELIVERY is log', () => {
  assert.deepEqual(
    parseConfig({ ...minimal, ...SMTP, MAIL_DELIVERY: 'log' }).mail,
    { delivery: 'log' }
  );
});
