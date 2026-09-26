import { useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { Button, Flex, Popover, Segmented, theme, Typography } from 'antd';
import {
  MinusOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  devicePreferences,
  READING_FONT_SIZE,
  type ReadingBackground,
  type ReadingFont,
  type ReadingLineHeight,
  type ReadingPreferences as Reading,
  type ReadingWidth,
} from '@/store/devicePreferencesSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

const BACKGROUND_OPTIONS: { value: ReadingBackground; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'white', label: 'White' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'dark', label: 'Dark' },
  { value: 'black', label: 'Black' },
];

const FONT_OPTIONS: { value: ReadingFont; label: string }[] = [
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
];

const LINE_HEIGHT_OPTIONS: ReadingLineHeight[] = [1.4, 1.6, 1.8, 2];

const WIDTH_OPTIONS: { value: ReadingWidth; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
  { value: 'full', label: 'Full' },
];

const Field: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={token.marginXXS}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      {children}
    </Flex>
  );
};

interface ReadingPreferencesProps {
  // The reader's page turns pages on the arrow keys, which the popover's own
  // controls need while it is open.
  onOpenChange?: (open: boolean) => void;
}

// How a Chapter reads on this device: a Device preference, so it holds for
// every Book. Each change applies at once, behind the open popover.
export const ReadingPreferences: FC<ReadingPreferencesProps> = ({
  onOpenChange,
}) => {
  const { token } = theme.useToken();
  const reading = useAppSelector((state) => state.devicePreferences.reading);
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  // Unmounted while open (a chapter loading swaps the page for a skeleton),
  // the popover never reports closing, and its page would keep the keys off.
  useEffect(() => {
    if (!open) return;
    onOpenChange?.(true);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  const change = (patch: Partial<Reading>) =>
    dispatch(devicePreferences.readingChanged(patch));
  const { min, max, step } = READING_FONT_SIZE;

  const form = (
    <Flex vertical gap={token.marginSM}>
      <Field label="Background">
        <Segmented<ReadingBackground>
          aria-label="Background"
          value={reading.background}
          onChange={(background) => change({ background })}
          options={BACKGROUND_OPTIONS}
        />
      </Field>
      <Field label="Font size">
        <Flex align="center" gap={token.marginSM}>
          <Button
            aria-label="Smaller text"
            icon={<MinusOutlined />}
            disabled={reading.fontSize <= min}
            onClick={() => change({ fontSize: reading.fontSize - step })}
          />
          <Typography.Text>{reading.fontSize}</Typography.Text>
          <Button
            aria-label="Larger text"
            icon={<PlusOutlined />}
            disabled={reading.fontSize >= max}
            onClick={() => change({ fontSize: reading.fontSize + step })}
          />
        </Flex>
      </Field>
      <Field label="Line height">
        <Segmented<ReadingLineHeight>
          aria-label="Line height"
          value={reading.lineHeight}
          onChange={(lineHeight) => change({ lineHeight })}
          options={LINE_HEIGHT_OPTIONS}
        />
      </Field>
      <Field label="Text width">
        <Segmented<ReadingWidth>
          aria-label="Text width"
          value={reading.width}
          onChange={(width) => change({ width })}
          options={WIDTH_OPTIONS}
        />
      </Field>
      <Field label="Font">
        <Segmented<ReadingFont>
          aria-label="Font"
          value={reading.font}
          onChange={(font) => change({ font })}
          options={FONT_OPTIONS}
        />
      </Field>
      <Button onClick={() => dispatch(devicePreferences.readingReset())}>
        Reset
      </Button>
    </Flex>
  );

  return (
    <Popover
      content={form}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
    >
      <Button aria-label="Reading preferences" icon={<SettingOutlined />} />
    </Popover>
  );
};
