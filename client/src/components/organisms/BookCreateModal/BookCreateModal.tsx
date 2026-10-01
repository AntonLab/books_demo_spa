import type { FC } from 'react';
import { Form, message } from 'antd';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import { BookForm } from '@/components/organisms/BookForm/BookForm';
import type {
  BookFieldValues,
  BookFormValues,
} from '@/components/organisms/BookForm/BookForm';
import { useCreateBook } from '@/queries/books';
import { useGenres } from '@/queries/genres';
import { useMySeries } from '@/queries/series';

interface BookCreateModalProps {
  authorId: number;
  onClose: () => void;
}

// Mounted only while open, so each opening starts with an empty form. It
// collects the book's own fields: every new book is a draft.
export const BookCreateModal: FC<BookCreateModalProps> = ({
  authorId,
  onClose,
}) => {
  const [form] = Form.useForm<BookFieldValues>();
  const series = useMySeries(authorId);
  const genres = useGenres();
  const create = useCreateBook();

  const handleSubmit = ({
    title,
    description,
    tags,
    seriesId,
    genreId,
  }: BookFormValues) => {
    create.mutate(
      { title, description, tags, seriesId, genreId },
      {
        onSuccess: () => {
          onClose();
          // Fire-and-forget: the toast's promise settles when it closes.
          void message.success('Book created.');
        },
      }
    );
  };

  return (
    <DiscardGuardModal
      title="Create book"
      form={form}
      onClose={onClose}
      footer={null}
    >
      <BookForm
        form={form}
        seriesOptions={series.data?.items ?? []}
        genreOptions={genres.data?.items ?? []}
        submitLabel="Create book"
        isSubmitting={create.isPending}
        error={create.error?.message ?? null}
        onSubmit={handleSubmit}
      />
    </DiscardGuardModal>
  );
};
