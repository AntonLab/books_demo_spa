import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import { Alert, Flex, Switch } from 'antd';
import { useLocation } from 'react-router';
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '@/queries/notifications';

// The id every announcement email links to (/profile#email-notifications);
// the server's mail templates hard-code it, so it must not change.
const ANCHOR = 'email-notifications';

export const EmailNotificationsSetting: FC = () => {
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const { hash } = useLocation();
  // HTMLElement, the type antd's Flex forwards its ref as.
  const block = useRef<HTMLElement>(null);
  const isLoaded = settings.data !== undefined;

  // A browser scrolls to a hash only on load, before this SPA has drawn the
  // switch; so the switch scrolls itself once there is something to show.
  useEffect(() => {
    if (isLoaded && hash === `#${ANCHOR}`) {
      block.current?.scrollIntoView({ block: 'center' });
    }
  }, [isLoaded, hash]);

  return (
    <Flex vertical gap="small" ref={block}>
      <Flex align="center" gap="small">
        <Switch
          id={ANCHOR}
          // The server's default, shown while the answer is on its way.
          checked={settings.data?.emailNotifications ?? true}
          loading={settings.isPending || update.isPending}
          disabled={settings.isError}
          onChange={(checked) => update.mutate({ emailNotifications: checked })}
        />
        <label htmlFor={ANCHOR}>Email notifications</label>
      </Flex>
      {settings.isError && (
        <Alert
          type="error"
          title="Could not load your notification settings."
        />
      )}
      {update.isError && (
        <Alert
          type="error"
          title="Could not save your notification settings."
        />
      )}
    </Flex>
  );
};
