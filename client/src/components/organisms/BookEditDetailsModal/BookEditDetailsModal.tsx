import type { FC } from 'react';
import { Alert, Form, Skeleton, message } from 'antd';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import { BookForm } from '@/components/organisms/BookForm/BookForm';
import type {
  BookFieldValues,
  BookFormValues,
} from '@/components/organisms/BookForm/BookForm';
import { useSession } from '@/queries/auth';
import { useBook, useUpdateBook } from '@/queries/books';
import { useGenres } from '@/queries/genres';
import { useMySeries } from '@/queries/series';
import { bookCapabilities } from '@/types/capabilities';

interface BookEditDetailsModalProps {
  bookId: number;
  onClose: () => void;
}

// Mounted only while open. It loads the book itself (cached when a page already
// holds it), and hands the form to the discard guard only once the form is on
// screen, so closing while loading or after a failed load closes at once.
export const BookEditDetailsModal: FC<BookEditDetailsModalProps> = ({
  bookId,
  onClose,
}) => {
  const [form] = Form.useForm<BookFieldValues>();
  const { data: session } = useSession();
  const { data: book, isPending, isError } = useBook(bookId);
  const series = useMySeries(
    session?.role === 'author' ? session.id : undefined
  );
  const genres = useGenres();
  const update = useUpdateBook(bookId);

  const showsForm =
    book !== undefined &&
    session != null &&
    bookCapabilities(book, session).mayEdit;

  const handleSubmit = (values: BookFormValues) => {
    update.mutate(values, {
      onSuccess: () => {
        onClose();
        // Fire-and-forget: the toast's promise settles when it closes.
        void message.success('Book saved.');
      },
    });
  };

  const renderBody = () => {
    if (isError) {
      return <Alert type="error" title="Could not load this book." />;
    }
    if (isPending) return <Skeleton active paragraph={{ rows: 4 }} />;
    if (!showsForm) {
      return (
        <Alert type="warning" title="Only its co-authors can edit this book." />
      );
    }

    // The book's current series is always an option, even one the viewer does
    // not co-author — a Moderator's, or a series whose credits changed — so the
    // select shows its name rather than a bare id.
    const own = (series.data?.items ?? []).map(({ id, title }) => ({
      id,
      title,
    }));
    const seriesOptions =
      book.series && !own.some((entry) => entry.id === book.series?.id)
        ? [...own, book.series]
        : own;

    return (
      <BookForm
        form={form}
        seriesOptions={seriesOptions}
        genreOptions={genres.data?.items ?? []}
        submitLabel="Save"
        showStatus
        initialValues={{
          title: book.title,
          description: book.description,
          tags: book.tags,
          seriesId: book.seriesId,
          genreId: book.genre?.id ?? null,
          status: book.status,
        }}
        isSubmitting={update.isPending}
        error={update.error?.message ?? null}
        onSubmit={handleSubmit}
      />
    );
  };

  return (
    <DiscardGuardModal
      title="Edit book details"
      form={showsForm ? form : undefined}
      onClose={onClose}
      footer={null}
    >
      {renderBody()}
    </DiscardGuardModal>
  );
};
