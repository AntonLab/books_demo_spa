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
