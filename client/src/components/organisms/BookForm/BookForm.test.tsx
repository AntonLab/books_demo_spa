import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookForm } from './BookForm';
import { renderWithProviders } from '@/test/renderWithProviders';

const series = [
  { id: 7, title: 'The Scale Cycle' },
  { id: 8, title: 'Letters from Blackmoor' },
];

const genres = [
  { id: 4, name: 'Gothic' },
  { id: 5, name: 'Hard SF' },
];

describe('BookForm', () => {
  it('submits what was typed, standalone by default', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <BookForm
        seriesOptions={series}
        genreOptions={genres}
        submitLabel="Create book"
        onSubmit={onSubmit}
      />
    );

    await userEvent.type(screen.getByLabelText('Title'), 'A Tale of Dragons');
    await userEvent.type(
      screen.getByLabelText('Description'),
      'Long ago, in a kingdom of scales.'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create book' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'A Tale of Dragons',
      description: 'Long ago, in a kingdom of scales.',
      tags: [],
      seriesId: null,
      genreId: null,
    });
  });

  it('refuses to submit without a title or a description', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <BookForm
        seriesOptions={[]}
        genreOptions={[]}
        submitLabel="Create book"
        onSubmit={onSubmit}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Create book' }));

    expect(await screen.findByText('Enter a title')).toBeInTheDocument();
    expect(screen.getByText('Enter a description')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('offers no status when creating — every book starts as a draft', () => {
    renderWithProviders(
      <BookForm
        seriesOptions={[]}
        genreOptions={[]}
        submitLabel="Create book"
        onSubmit={jest.fn()}
      />
    );

    expect(screen.queryByRole('radio', { name: 'Complete' })).toBeNull();
  });

  it('edits an existing book, status included', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <BookForm
        seriesOptions={series}
        genreOptions={genres}
        submitLabel="Save"
        showStatus
        initialValues={{
          title: 'A Tale of Dragons',
          description: 'Long ago.',
          tags: ['epic'],
          seriesId: 7,
          genreId: null,
          status: 'draft',
        }}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByLabelText('Title')).toHaveValue('A Tale of Dragons');
    expect(screen.getByRole('radio', { name: 'Draft' })).toBeChecked();

    // antd's button-style radios hide the input itself; the label is what a
    // person clicks.
    await userEvent.click(screen.getByText('Complete'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'A Tale of Dragons',
      description: 'Long ago.',
      tags: ['epic'],
      seriesId: 7,
      genreId: null,
      status: 'complete',
    });
  });

  it('shows a server error and keeps what was typed', () => {
    renderWithProviders(
      <BookForm
        seriesOptions={[]}
        genreOptions={[]}
        submitLabel="Save"
        initialValues={{
          title: 'Kept',
          description: 'Also kept',
          tags: [],
          seriesId: null,
          genreId: null,
        }}
        error="You may only add books to series you co-author"
        onSubmit={jest.fn()}
      />
    );

    expect(
      screen.getByText('You may only add books to series you co-author')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Kept');
  });

  it('disables the button while the request is in flight', () => {
    renderWithProviders(
      <BookForm
        seriesOptions={[]}
        genreOptions={[]}
        submitLabel="Save"
        isSubmitting
        onSubmit={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Save/ })).toHaveClass(
      'ant-btn-loading'
    );
  });

  it('offers No genre first and submits null for it', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <BookForm
        seriesOptions={[]}
        genreOptions={genres}
        submitLabel="Create book"
        onSubmit={onSubmit}
      />
    );

    await userEvent.type(screen.getByLabelText('Title'), 'A Tale of Dragons');
    await userEvent.type(screen.getByLabelText('Description'), 'Long ago.');
    await userEvent.click(screen.getByRole('button', { name: 'Create book' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'A Tale of Dragons',
      description: 'Long ago.',
      tags: [],
      seriesId: null,
      genreId: null,
    });
  });

  it('round-trips a chosen genre as its id', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <BookForm
        seriesOptions={series}
        genreOptions={genres}
        submitLabel="Save"
        showStatus
        initialValues={{
          title: 'A Tale of Dragons',
          description: 'Long ago.',
          tags: ['epic'],
          seriesId: 7,
          genreId: 4,
          status: 'draft',
        }}
        onSubmit={onSubmit}
      />
    );

    // The loaded genre shows by name, not as a bare id. antd renders the
    // chosen option's label in a sibling of the combobox, not inside it, so
    // this is a text query rather than one on getByLabelText('Genre').
    expect(screen.getByText('Gothic')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'A Tale of Dragons',
      description: 'Long ago.',
      tags: ['epic'],
      seriesId: 7,
      genreId: 4,
      status: 'draft',
    });
  });
});
