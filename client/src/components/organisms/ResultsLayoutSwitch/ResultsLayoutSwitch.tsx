import type { FC, ReactNode } from 'react';
import { Button, Space, Tooltip } from 'antd';
import type { ColProps } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { TILE_COLUMNS } from '@/components/organisms/CardList/CardList';
import {
  devicePreferences,
  type ResultsLayout,
} from '@/store/devicePreferencesSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

// Each result's `Col` spans in either layout, for the CardList beside the
// switch.
export const RESULTS_COLUMNS: Record<ResultsLayout, ColProps> = {
  grid: TILE_COLUMNS,
  list: { span: 24 },
};

const OPTIONS: { value: ResultsLayout; label: string; icon: ReactNode }[] = [
  { value: 'grid', label: 'Grid', icon: <AppstoreOutlined /> },
  { value: 'list', label: 'List', icon: <UnorderedListOutlined /> },
];

// A Device preference, so the choice holds on every page that lists results
// on this device.
export const ResultsLayoutSwitch: FC = () => {
  const layout = useAppSelector(
    (state) => state.devicePreferences.resultsLayout
  );
  const dispatch = useAppDispatch();

  return (
    <Space.Compact role="group" aria-label="Results layout">
      {OPTIONS.map(({ value, label, icon }) => (
        <Tooltip key={value} title={label}>
          <Button
            aria-label={label}
            aria-pressed={layout === value}
            type={layout === value ? 'primary' : 'default'}
            icon={icon}
            onClick={() =>
              dispatch(devicePreferences.resultsLayoutChanged(value))
            }
          />
        </Tooltip>
      ))}
    </Space.Compact>
  );
};
