import type { FC } from 'react';
import { App, Button, Flex, Typography } from 'antd';
import { devicePreferences } from '@/store/devicePreferencesSlice';
import { useAppDispatch } from '@/store/hooks';

export const DevicePreferencesReset: FC = () => {
  const dispatch = useAppDispatch();
  const { message } = App.useApp();

  return (
    <section>
      <Typography.Title level={5}>This device</Typography.Title>
      <Typography.Paragraph type="secondary">
        These affect only this device.
      </Typography.Paragraph>
      <Flex gap="small" wrap>
        <Button
          onClick={() => {
            dispatch(devicePreferences.themeReset());
            void message.success('Theme reset.');
          }}
        >
          Reset theme
        </Button>
        <Button
          onClick={() => {
            dispatch(devicePreferences.readingReset());
            void message.success('Reading settings reset.');
          }}
        >
          Reset reading settings
        </Button>
      </Flex>
    </section>
  );
};
