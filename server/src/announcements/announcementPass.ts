import type { MailDelivery } from '../delivery/mailDelivery.ts';
import { logger } from '../logger.ts';
import type { OnlineRegistry } from '../online/onlineRegistry.ts';
import type {
  AnnouncementRepository,
  RecipientNews,
} from '../repositories/announcementRepository.ts';
import { composeAnnouncementMail } from './announcementMail.ts';

export const ANNOUNCEMENT_INTERVAL_MS = 60_000;

export interface AnnouncementPassDeps {
  announcementRepository: AnnouncementRepository;
  onlineRegistry: Pick<OnlineRegistry, 'revalidate' | 'isOnline' | 'push'>;
  mailDelivery: MailDelivery;
  appBaseUrl: string;
}

interface AnnouncementPass {
  stop(): void;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function tell(
  deps: AnnouncementPassDeps,
  recipient: RecipientNews
): Promise<void> {
  if (deps.onlineRegistry.isOnline(recipient.userId)) {
    for (const notification of recipient.notifications) {
      deps.onlineRegistry.push(recipient.userId, notification);
    }
    return;
  }
  if (recipient.email === null) return;
  try {
    await deps.mailDelivery.send(
      composeAnnouncementMail(recipient.email, recipient, deps.appBaseUrl)
    );
  } catch (error) {
    // No retry: the rows are announced for good and the Notification is kept,
    // so the Account loses only this email (ADR-0013).
    logger.error('Announcement mail failed', {
      userId: recipient.userId,
      error: messageOf(error),
    });
  }
}

// One pass. Never rejects: a failure is logged and the next pass goes on,
// so neither a database hiccup nor a mail server takes the process down.
export async function runAnnouncementPass(
  deps: AnnouncementPassDeps,
  now: Date = new Date()
): Promise<void> {
  let news: RecipientNews[];
  try {
    // announce() has committed by the time it returns: nothing below may run
    // inside the transaction (spec, "The announcement pass").
    news = await deps.announcementRepository.announce(now);
  } catch (error) {
    logger.error('Announcement pass failed', messageOf(error));
    return;
  }
  if (news.length === 0) return;

  // A stream whose session ended since the last check must not make its
  // Account look Online and cost it the email.
  await deps.onlineRegistry.revalidate();
  for (const recipient of news) {
    await tell(deps, recipient);
  }
}

// One pass at boot, then one a minute. The interval is unref()ed so it never
// holds the process open; the graceful shutdown stops it. A tick that finds
// the previous pass still sending mail skips: the next tick picks up anything
// that came due meanwhile, since a pass never looks at a time window.
export function startAnnouncementPass(
  deps: AnnouncementPassDeps
): AnnouncementPass {
  let running = false;
  const run = (): void => {
    if (running) return;
    running = true;
    // void: runAnnouncementPass never rejects, and nothing waits on a pass.
    void runAnnouncementPass(deps).finally(() => {
      running = false;
    });
  };

  run();
  const timer = setInterval(run, ANNOUNCEMENT_INTERVAL_MS);
  timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
