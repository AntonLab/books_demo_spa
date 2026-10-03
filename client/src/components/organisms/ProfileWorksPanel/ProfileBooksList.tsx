import { useRef, type FC } from 'react';
import { SortOrderSwitch } from '@/components/molecules/SortOrderSwitch/SortOrderSwitch';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import type { SearchFormHandle } from '@/components/organisms/SearchForm/SearchForm';
import type { ProfileScope } from '@/types/profileScope';
import { ProfileListShell } from './ProfileListShell';
import { useProfileBooks } from './useProfileLists';
import { BookRowActions } from './WorkRowActions';

interface ProfileBooksListProps {
  scope: ProfileScope;
  viewerId: number;
  onEdit: (bookId: number) => void;
}

export const ProfileBooksList: FC<ProfileBooksListProps> = ({
  scope,
  viewerId,
  onEdit,
}) => {
  const { sort, list, ...filters } = useProfileBooks(scope, viewerId);
  const formRef = useRef<SearchFormHandle>(null);
  return (
    <ProfileListShell
      scope={scope}
      kind="books"
      filters={filters}
      list={list}
      formRef={formRef}
      toolbarStart={
        <SortOrderSwitch
          value={sort}
          onChange={(next) => formRef.current?.searchWith(next)}
        />
      }
      renderCard={(row) => <BookCard book={row} />}
      renderActions={(row) => (
        <BookRowActions
          scope={scope}
          book={row}
          onEdit={() => onEdit(row.id)}
        />
      )}
    />
  );
};
