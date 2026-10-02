import { useMemo, useState } from 'react';
import type { FC, KeyboardEvent } from 'react';
import { TreeSelect } from 'antd';
import type { TreeSelectProps } from 'antd';
import type { GenreListItem } from 'shared';
import { buildGenreTree, genrePathOf } from '@/types/genreTree';
import styles from '@/components/molecules/ClearableSelect/ClearableSelect.module.css';

// `value` and `onChange` are the pair a Form.Item injects.
export type GenreTreeSelectProps = Omit<
  TreeSelectProps<number | undefined>,
  'treeData' | 'value' | 'onChange' | 'allowClear' | 'showSearch'
> & {
  genres: readonly GenreListItem[];
  value?: number;
  onChange?: (value: number | undefined) => void;
};

// A tree of Genres and their Subgenres where any node can be chosen. The list
// shows each short name; the closed box shows the full path. Clears like
// ClearableSelect: Delete or Backspace on the focused, closed select.
export const GenreTreeSelect: FC<GenreTreeSelectProps> = ({
  genres,
  value,
  onChange,
  onKeyDown,
  onOpenChange,
  ...rest
}) => {
  const [open, setOpen] = useState(false);

  const treeData = useMemo(() => {
    const node = ({ id, name }: GenreListItem) => ({
      value: id,
      title: name,
      label: genrePathOf(id, genres),
    });
    return buildGenreTree(genres).map(({ item, children }) => ({
      ...node(item),
      children: children.map(node),
    }));
  }, [genres]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (
      !open &&
      value !== undefined &&
      (event.key === 'Delete' || event.key === 'Backspace')
    ) {
      onChange?.(undefined);
    }
  };

  return (
    <TreeSelect<number | undefined>
      {...rest}
      className={styles.select}
      treeData={treeData}
      treeNodeLabelProp="label"
      allowClear
      treeDefaultExpandAll
      virtual={false}
      value={value}
      onChange={(next) => onChange?.(next)}
      onKeyDown={handleKeyDown}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    />
  );
};
