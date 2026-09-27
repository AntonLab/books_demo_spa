import test from 'node:test';
import assert from 'node:assert/strict';
import { recordLogs } from '../logger.testkit.ts';
import type { SmtpMailConfig } from '../db/config.ts';
import {
  createLogMailDelivery,
  createMailDelivery,
  createSmtpMailDelivery,
  type MailTransporter,
} from './mailDelivery.ts';

const SMTP: SmtpMailConfig = {
  delivery: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  user: 'mailer',
  password: 'mailer-secret',
  from: 'noreply@example.com',
};

const MESSAGE = {
  to: 'bob@example.com',
  subject: 'Hello',
  text: 'Line one\nLine two',
};

test('the log delivery writes the recipient, the subject and the body as one info line', async (t) => {
  const lines = recordLogs(t);

  await createLogMailDelivery().send(MESSAGE);

  assert.deepEqual(lines, [
    {
      level: 'info',
      message: 'Mail to bob@example.com: Hello\nLine one\nLine two',
      meta: undefined,
    },
  ]);
});

test('the smtp delivery hands the message to the transporter, sent from MAIL_FROM', async () => {
  const sent: unknown[] = [];
  const transporter: MailTransporter = {
    async sendMail(mail) {
      sent.push(mail);
      return {};
    },
  };

  await createSmtpMailDelivery(SMTP, transporter).send(MESSAGE);

  assert.deepEqual(sent, [{ from: 'noreply@example.com', ...MESSAGE }]);
});

test('the smtp delivery rejects when the transporter does, and logs nothing itself', async (t) => {
  const lines = recordLogs(t);
  const transporter: MailTransporter = {
    async sendMail() {
      throw new Error('connect ECONNREFUSED');
    },
  };

  await assert.rejects(
    createSmtpMailDelivery(SMTP, transporter).send(MESSAGE),
    /ECONNREFUSED/
  );
  assert.deepEqual(lines, []);
});

test('createMailDelivery picks the log delivery for MAIL_DELIVERY=log', async (t) => {
  const lines = recordLogs(t);

  await createMailDelivery({ delivery: 'log' }).send(MESSAGE);

  assert.equal(lines.length, 1);
});
