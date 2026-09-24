import type { FC } from 'react';
import { Alert, Typography } from 'antd';
import { useNavigate } from 'react-router';
import { BookForm } from '@/components/organisms/BookForm/BookForm';
import type { BookFormValues } from '@/components/organisms/BookForm/BookForm';
import { useSession } from '@/queries/auth';
import { useCreateBook } from '@/queries/books';
import { useGenres } from '@/queries/genres';
import { useMySeries } from '@/queries/series';

// Creating collects only the book's own fields. It has no status to choose —
// every new book is a draft — and no Co-authors yet, because a credit needs a
// book to hang off; both are one step away on the edit page this leads to.
export const NewBookPage: FC = () => {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const isAuthor = session?.role === 'author';
  const series = useMySeries(isAuthor ? session.id : undefined);
  const genres = useGenres();
  const create = useCreateBook();

  if (!isAuthor) {
    return (
      <Alert
        type="info"
        title="Only an account holding the author role can create books."
      />
    );
  }

  const handleSubmit = ({
    title,
    description,
    tags,
    seriesId,
    genreId,
  }: BookFormValues) => {
    create.mutate(
      { title, description, tags, seriesId, genreId },
      { onSuccess: (book) => void navigate(`/books/${book.id}/edit`) }
    );
  };

  return (
    <>
      <Typography.Title level={2}>New book</Typography.Title>
      <BookForm
        seriesOptions={series.data?.items ?? []}
        genreOptions={genres.data?.items ?? []}
        submitLabel="Create book"
        isSubmitting={create.isPending}
        error={create.error?.message ?? null}
        onSubmit={handleSubmit}
      />
    </>
  );
};
