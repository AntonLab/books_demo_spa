import { useState } from 'react';
import type { FC } from 'react';
import { Alert, App, Button, Flex, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '@/api/client';
import { AddToReadingList } from '@/components/organisms/AddToReadingList/AddToReadingList';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import { GoneRedirect } from '@/components/molecules/GoneRedirect/GoneRedirect';
import { FavoriteButton } from '@/components/molecules/FavoriteButton/FavoriteButton';
import { LibraryButtons } from '@/components/molecules/LibraryButtons/LibraryButtons';
import {
  RESULTS_COLUMNS,
  ResultsLayoutSwitch,
} from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import { SeriesCard } from '@/components/organisms/SeriesCard/SeriesCard';
import { SeriesEditDetailsModal } from '@/components/organisms/SeriesEditDetailsModal/SeriesEditDetailsModal';
import { useSession } from '@/queries/auth';
import {
  mayAddSeriesToReadingList,
  seriesCapabilities,
} from '@/types/capabilities';
import { useBooksInSeries } from '@/queries/books';
import { useToggleFavorite } from '@/queries/favorites';
import { queryKeys } from '@/queries/keys';
import { useSeriesLibraryActions } from '@/queries/library';
import { useSeries } from '@/queries/series';
import { useAppSelector } from '@/store/hooks';
import { isId } from '@/types/id';
import styles from './SeriesPage.module.css';

const SERIES_GONE = 'This series no longer exists.';

export const SeriesPage: FC = () => {
  const seriesId = Number(useParams().id);
  // Not an id the server could answer for, so it is not asked.
  return isId(seriesId) ? (
    <SeriesView seriesId={seriesId} />
  ) : (
    <GoneRedirect message={SERIES_GONE} />
  );
};

const SeriesView: FC<{ seriesId: number }> = ({ seriesId }) => {
  const navigate = useNavigate();
  const series = useSeries(seriesId);
  const { data: session } = useSession();
  const toggleFavorite = useToggleFavorite(queryKeys.seriesDetail(seriesId));
  const libraryActions = useSeriesLibraryActions(seriesId);
  const { message } = App.useApp();
  const toastError = (error: Error) => void message.error(error.message);
  const [editing, setEditing] = useState(false);

  if (series.isError) {
    // A link from a book page outlives the series it names.
    return series.error instanceof ApiError && series.error.status === 404 ? (
      <GoneRedirect message={SERIES_GONE} />
    ) : (
      <Alert type="error" title="Could not load this series." />
    );
  }
  if (series.isPending) return <Skeleton active paragraph={{ rows: 3 }} />;

  // Mirrors the server: its Co-authors and Moderators may edit a series.
  const { isCoAuthor, mayEdit, mayFavorite, mayKeepInLibrary } =
    seriesCapabilities(series.data, session);

  return (
    <>
      <SeriesCard series={series.data} />
      <Flex justify="end" align="center" gap="middle" className={styles.bar}>
        {/* A series has no statistics tab, so the button is the only place
            its Favorites count shows. */}
        {mayFavorite && (
          <FavoriteButton
            count={series.data.favoriteCount}
            favoriteId={series.data.viewerFavoriteId}
            disabled={toggleFavorite.isPending}
            onToggle={(existingId) =>
              toggleFavorite.mutate({
                existingId,
                payload: { seriesId },
              })
            }
          />
        )}
        {mayKeepInLibrary &&
          series.data.bookCount > 0 &&
          series.data.viewerLibrary !== null && (
            <LibraryButtons
              inLibrary={series.data.viewerLibrary.inLibrary}
              notInterested={series.data.viewerLibrary.notInterested}
              disabled={libraryActions.isPending}
              addLabel="Add series to Library"
              removeLabel="Remove series from Library"
              onAdd={() =>
                libraryActions.add.mutate(undefined, { onError: toastError })
              }
              onRemove={() =>
                libraryActions.remove.mutate(undefined, { onError: toastError })
              }
              onToggleNotInterested={() =>
                libraryActions.toggleNotInterested.mutate(undefined, {
                  onError: toastError,
                })
              }
            />
          )}
        {mayAddSeriesToReadingList(series.data, session) && (
          <AddToReadingList target={{ seriesId }} />
        )}
        {mayEdit && (
          <Button onClick={() => setEditing(true)}>Edit series</Button>
        )}
        <ResultsLayoutSwitch />
      </Flex>
      {editing && (
        <SeriesEditDetailsModal
          seriesId={seriesId}
          onClose={() => setEditing(false)}
          onGone={() => void navigate(isCoAuthor ? '/profile/my-books' : '/')}
        />
      )}
      {/* Mounted only once the series has loaded, so a missing one asks for
          no books. */}
      <SeriesBooks seriesId={seriesId} />
    </>
  );
};

const SeriesBooks: FC<{ seriesId: number }> = ({ seriesId }) => {
  const books = useBooksInSeries(seriesId);
  const layout = useAppSelector(
    (state) => state.devicePreferences.resultsLayout
  );

  return (
    <CardList
      noun="books"
      items={books.data?.items ?? []}
      renderItem={(book) => <BookCard book={book} tile={layout === 'grid'} />}
      columns={RESULTS_COLUMNS[layout]}
      isPending={books.isPending}
      isError={books.isError}
      error={books.error}
      emptyText="No book in this series has been published yet."
    />
  );
};
