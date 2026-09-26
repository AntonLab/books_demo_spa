import { createTransport } from 'nodemailer';
import type { MailConfig, SmtpMailConfig } from '../db/config.ts';
import { logger } from '../logger.ts';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

// The one door mail leaves by. Callers compose the message; a delivery only
// carries it. A rejected send is the caller's to handle: password reset lets
// it fail the request, the announcement pass logs it and moves on (ADR-0013).
export interface MailDelivery {
  send(message: MailMessage): Promise<void>;
}

// The slice of nodemailer's transporter this file uses, so a spec hands in a
// fake and no test opens a socket.
export interface MailTransporter {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

export function createLogMailDelivery(): MailDelivery {
  return {
    async send({ to, subject, text }) {
      logger.info(`Mail to ${to}: ${subject}\n${text}`);
    },
  };
}

export function createSmtpMailDelivery(
  config: SmtpMailConfig,
  // nodemailer connects on the first send, not here, so building the default
  // transporter at boot costs no network round trip.
  transporter: MailTransporter = createTransport({
    host: config.host,
    port: config.port,
    // 465 is TLS from the first byte; any other port starts in the clear and
    // upgrades with STARTTLS, which nodemailer does by itself.
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  })
): MailDelivery {
  return {
    async send({ to, subject, text }) {
      await transporter.sendMail({ from: config.from, to, subject, text });
    },
  };
}

export function createMailDelivery(config: MailConfig): MailDelivery {
  return config.delivery === 'smtp'
    ? createSmtpMailDelivery(config)
    : createLogMailDelivery();
}
