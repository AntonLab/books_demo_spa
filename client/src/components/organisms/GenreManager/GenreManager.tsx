import { useState } from 'react';
import type { FC, Key } from 'react';
import {
  Alert,
  Empty,
  Flex,
  Input,
  Popconfirm,
  Select,
  Skeleton,
  Tree,
  Typography,
} from 'antd';
import type { TreeDataNode } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { AdminGenreListItem } from 'shared';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import {
  GenreFormModal,
  type GenreFormMode,
} from '@/components/organisms/GenreFormModal/GenreFormModal';
import {
  useDeleteGenre,
  useGenresCounts,
  useUpdateGenre,
} from '@/queries/genres';
import {
  countsLabel,
  dropParentOf,
  filterGenreTree,
  totalsOf,
  type UsageFilter,
} from '@/types/genreAdmin';
import { buildGenreTree } from '@/types/genreTree';
import spacing from '@/theme/spacing.module.css';

interface GenreTreeData extends TreeDataNode {
  genre: AdminGenreListItem;
  counts: { bookCount: number; seriesCount: number };
  hasSubgenres: boolean;
  children?: GenreTreeData[];
}

const USAGE_OPTIONS: { value: UsageFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'books', label: 'Has books' },
  { value: 'series', label: 'Has series' },
  { value: 'unused', label: 'Unused' },
];

export const GenreManager: FC = () => {
  const genres = useGenresCounts();
  const remove = useDeleteGenre();
  const move = useUpdateGenre();
  const [query, setQuery] = useState('');
  const [usage, setUsage] = useState<UsageFilter>('all');
  const [expanded, setExpanded] = useState<Key[]>([]);
  const [formMode, setFormMode] = useState<GenreFormMode | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const items = genres.data?.items ?? [];
  const tree = buildGenreTree(items);
  const shownChildren = new Map(
    filterGenreTree(tree, { query, usage }).map((node) => [
      node.item.id,
      node.children,
    ])
  );
  // Walks the whole tree, not the filtered one: the totals and the Delete lock
  // must count Subgenres a filter hides.
  const treeData: GenreTreeData[] = tree.flatMap((node) => {
    const children = shownChildren.get(node.item.id);
    return children === undefined
      ? []
      : [
          {
            key: node.item.id,
            genre: node.item,
            counts: totalsOf(node),
            hasSubgenres: node.children.length > 0,
            children: children.map((child) => ({
              key: child.id,
              genre: child,
              counts: child,
              hasSubgenres: false,
            })),
          },
        ];
  });
  const searching = query.trim() !== '';
  const expandedKeys = searching
    ? treeData.filter((node) => node.children?.length).map((node) => node.key)
    : expanded;

  // A delete error belongs to the moment it happened: starting anything else
  // on the page retires it.
  const openForm = (mode: GenreFormMode) => {
    remove.reset();
    setFormMode(mode);
  };

  const renderTitle = ({ genre, counts, hasSubgenres }: GenreTreeData) => (
    <Flex align="center" gap="small">
      <Typography.Text>{genre.name}</Typography.Text>
      <Typography.Text type="secondary">{countsLabel(counts)}</Typography.Text>
      <Flex
        gap="small"
        style={{ marginInlineStart: 'auto' }}
        // rc-tree handles Enter on its list and swallows the button's click.
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation();
          }
        }}
      >
        {genre.parentId === null && (
          <IconButton
            size="small"
            type="text"
            icon={<PlusOutlined />}
            label={`Add subgenre to ${genre.name}`}
            onClick={() => openForm({ kind: 'create', parentId: genre.id })}
          />
        )}
        <IconButton
          size="small"
          type="text"
          icon={<EditOutlined />}
          label={`Edit ${genre.name}`}
          onClick={() => openForm({ kind: 'edit', genre })}
        />
        <Popconfirm
          title={`Delete ${genre.name}?`}
          description="Books and series in this genre will be left without one."
          okText="Yes, delete"
          okButtonProps={{ danger: true }}
          onConfirm={() => {
            move.reset();
            remove.mutate(genre.id);
          }}
          onOpenChange={(open) => setConfirmingId(open ? genre.id : null)}
        >
          <IconButton
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            disabled={hasSubgenres}
            tooltipHidden={confirmingId === genre.id}
            label={
              hasSubgenres
                ? `Cannot delete ${genre.name}: it has subgenres`
                : `Delete ${genre.name}`
            }
          />
        </Popconfirm>
      </Flex>
    </Flex>
  );

  return (
    <>
      <Typography.Title level={3}>Genres</Typography.Title>

      <Flex wrap gap="small" className={spacing.gapBelow}>
        <Input
          aria-label="Search genres"
          placeholder="Search genres"
          allowClear
          value={query}
          onChange={(event) => {
            remove.reset();
            setQuery(event.target.value);
          }}
        />
        <Select
          aria-label="Filter genres"
          value={usage}
          options={USAGE_OPTIONS}
          onChange={(value) => {
            remove.reset();
            setUsage(value);
          }}
        />
        <IconButton
          type="primary"
          icon={<PlusOutlined />}
          label="Add genre"
          onClick={() => openForm({ kind: 'create', parentId: null })}
        >
          Add genre
        </IconButton>
      </Flex>

      {(remove.error ?? move.error) && (
        <Alert
          type="error"
          title={(remove.error ?? move.error)?.message}
          className={spacing.gapBelow}
        />
      )}

      {genres.isError ? (
        <Alert type="error" title="Could not load the genres." />
      ) : genres.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : items.length === 0 ? (
        <Empty description="No genres yet." />
      ) : treeData.length === 0 ? (
        <Empty description="No genres match." />
      ) : (
        <Tree<GenreTreeData>
          virtual={false}
          blockNode
          selectable={false}
          treeData={treeData}
          expandedKeys={expandedKeys}
          onExpand={setExpanded}
          titleRender={renderTitle}
          // A second move sent before the first settles reads a stale tree and
          // can drop onto a parent that is about to change.
          draggable={move.isPending ? false : { icon: false }}
          allowDrop={({ dragNode, dropNode, dropPosition }) =>
            dropParentOf(
              tree,
              Number(dragNode.key),
              Number(dropNode.key),
              dropPosition !== 0
            ) !== null
          }
          onDrop={({ dragNode, node, dropToGap }) => {
            const target = dropParentOf(
              tree,
              Number(dragNode.key),
              Number(node.key),
              dropToGap
            );
            if (target === null) return;
            remove.reset();
            move.mutate({ id: Number(dragNode.key), payload: target });
          }}
        />
      )}

      {formMode && (
        <GenreFormModal
          mode={formMode}
          genres={items}
          onClose={() => setFormMode(null)}
        />
      )}
    </>
  );
};
