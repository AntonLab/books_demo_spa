import type { ReactNode, Ref } from 'react';
import { Flex } from 'antd';
import { ListPagination } from '@/components/molecules/ListPagination/ListPagination';
import { CardList } from '@/components/organisms/CardList/CardList';
import { RESULTS_COLUMNS } from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import {
  SearchFiltersToggle,
  SearchForm,
  type SearchFormHandle,
} from '@/components/organisms/SearchForm/SearchForm';
import { useAppSelector } from '@/store/hooks';
import spacing from '@/theme/spacing.module.css';
import type { ProfileScope } from '@/types/profileScope';
import type {
  ProfileFilters,
  ProfileList,
  ProfileRow,
} from './useProfileLists';
import styles from './ProfileWorksPanel.module.css';

const FORM_ID = 'profile-filters';

const emptyTextOf = (
  scope: ProfileScope,
  kind: 'books' | 'series',
  filtered: boolean
): string =>
  filtered
    ? `No ${kind} match these filters.`
    : scope === 'mine'
      ? kind === 'books'
        ? 'You have not written a book yet.'
        : 'You have not started a series yet.'
      : kind === 'books'
        ? 'No book is in your favorites yet.'
        : 'No series is in your favorites yet.';

interface ProfileListShellProps<T extends { id: number }> {
  scope: ProfileScope;
  kind: 'books' | 'series';
  filters: ProfileFilters;
  list: ProfileList<T>;
  formRef?: Ref<SearchFormHandle>;
  toolbarStart?: ReactNode;
  renderCard: (row: ProfileRow<T>) => ReactNode;
  renderActions: (row: ProfileRow<T>) => ReactNode;
}

export const ProfileListShell = <T extends { id: number }>({
  scope,
  kind,
  filters,
  list,
  formRef,
  toolbarStart,
  renderCard,
  renderActions,
}: ProfileListShellProps<T>) => {
  const filtersExpanded = useAppSelector(
    (state) => state.devicePreferences.searchFormExpanded
  );
  // React warns when `key` arrives inside a spread, so it goes on its own.
  const { key: formKey, ...formProps } = filters.form;

  return (
    <>
      <Flex align="center" gap="middle" wrap className={spacing.gapBelow}>
        {toolbarStart}
        <Flex gap="small" className={styles.toolbarEnd}>
          <SearchFiltersToggle
            controls={FORM_ID}
            filterCount={filters.filterCount}
          />
        </Flex>
      </Flex>
      <div hidden={!filtersExpanded}>
        <SearchForm
          key={formKey}
          ref={formRef}
          {...formProps}
          id={FORM_ID}
          genres={filters.genres}
          mode={kind}
          hideAuthor={scope === 'mine'}
        />
      </div>
      <CardList
        noun={kind}
        items={list.items}
        renderItem={(row) => (
          <Flex gap="small" align="flex-start">
            <div className={styles.card}>{renderCard(row)}</div>
            {renderActions(row)}
          </Flex>
        )}
        columns={RESULTS_COLUMNS.list}
        isPending={list.isPending}
        isError={list.error !== null}
        error={list.error}
        emptyText={emptyTextOf(scope, kind, list.filtered)}
      />
      {!list.isPending && list.error === null && (
        <ListPagination
          className={styles.pagination}
          current={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onChange={list.goToPage}
        />
      )}
    </>
  );
};
