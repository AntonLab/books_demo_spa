import { useMemo } from 'react';
import type { FC } from 'react';
import { TreeSelect } from 'antd';
import type { TreeSelectProps } from 'antd';
import type { GenreListItem } from 'shared';
import { buildGenreTree, genrePathOf } from '@/types/genreTree';
import { useClearable } from '@/hooks/useClearable';

// `value` and `onChange` are the pair a Form.Item injects.
type GenreTreeSelectProps = Omit<
  TreeSelectProps<number | undefined>,
  'treeData' | 'value' | 'onChange' | 'allowClear' | 'showSearch'
> & {
  genres: readonly GenreListItem[];
  value?: number;
  onChange?: (value: number | undefined) => void;
};

// A tree of Genres and their Subgenres where any node can be chosen. The list
// shows each short name; the closed box shows the full path. Clears through
// `useClearable`.
export const GenreTreeSelect: FC<GenreTreeSelectProps> = ({
  genres,
  value,
  onChange,
  onKeyDown,
  onOpenChange,
  ...rest
}) => {
  const clearable = useClearable({ value, onChange, onKeyDown, onOpenChange });

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

  return (
    <TreeSelect<number | undefined>
      {...rest}
      {...clearable}
      treeData={treeData}
      treeNodeLabelProp="label"
      treeDefaultExpandAll
      virtual={false}
      value={value}
      onChange={(next) => onChange?.(next)}
    />
  );
};
