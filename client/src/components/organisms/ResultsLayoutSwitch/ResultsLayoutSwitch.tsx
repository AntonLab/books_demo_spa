import type { FC } from 'react';
import { Segmented } from 'antd';
import type { ColProps } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faList, faTableCellsLarge } from '@fortawesome/free-solid-svg-icons';
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

// A Device preference, so the choice holds on every page that lists results
// on this device.
export const ResultsLayoutSwitch: FC = () => {
  const layout = useAppSelector(
    (state) => state.devicePreferences.resultsLayout
  );
  const dispatch = useAppDispatch();

  return (
    <Segmented<ResultsLayout>
      aria-label="Results layout"
      value={layout}
      onChange={(value) =>
        dispatch(devicePreferences.resultsLayoutChanged(value))
      }
      options={[
        {
          value: 'grid',
          icon: <FontAwesomeIcon icon={faTableCellsLarge} aria-label="Grid" />,
          tooltip: 'Grid',
        },
        {
          value: 'list',
          icon: <FontAwesomeIcon icon={faList} aria-label="List" />,
          tooltip: 'List',
        },
      ]}
    />
  );
};
