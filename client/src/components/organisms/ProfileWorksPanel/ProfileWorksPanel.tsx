import { useState, type FC } from 'react';
import { Tabs } from 'antd';
import { useSearchParams } from 'react-router';
import { BookEditDetailsModal } from '@/components/organisms/BookEditDetailsModal/BookEditDetailsModal';
import { SeriesEditDetailsModal } from '@/components/organisms/SeriesEditDetailsModal/SeriesEditDetailsModal';
import type { ProfileScope } from '@/types/profileScope';
import { ProfileBooksList } from './ProfileBooksList';
import { ProfileSeriesList } from './ProfileSeriesList';
import { profileTabOf } from './useProfileLists';

interface Props {
  scope: ProfileScope;
  // An Account holding the author Role when scope is 'mine': the caller gates
  // on it. Favorites ignores it.
  viewerId: number;
}

export const ProfileWorksPanel: FC<Props> = ({ scope, viewerId }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<{
    kind: 'book' | 'series';
    id: number;
  } | null>(null);

  // The inner tab lives in the URL (`?tab=series`) because each list keeps its
  // filters there too; this supersedes ADR-0010 for these two panels. Replacing
  // the whole query string drops every filter, `page` and `pageSize`, so the
  // other list never inherits them.
  const onChange = (key: string) =>
    setSearchParams(key === 'series' ? { tab: 'series' } : {});

  return (
    <>
      <Tabs
        activeKey={profileTabOf(searchParams)}
        onChange={onChange}
        destroyOnHidden
        items={[
          {
            key: 'books',
            label: 'Books',
            children: (
              <ProfileBooksList
                scope={scope}
                viewerId={viewerId}
                onEdit={(id) => setEditing({ kind: 'book', id })}
              />
            ),
          },
          {
            key: 'series',
            label: 'Series',
            children: (
              <ProfileSeriesList
                scope={scope}
                viewerId={viewerId}
                onEdit={(id) => setEditing({ kind: 'series', id })}
              />
            ),
          },
        ]}
      />
      {editing?.kind === 'book' && (
        <BookEditDetailsModal
          bookId={editing.id}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'series' && (
        <SeriesEditDetailsModal
          seriesId={editing.id}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};
