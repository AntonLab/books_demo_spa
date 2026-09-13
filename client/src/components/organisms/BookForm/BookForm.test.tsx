import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookForm } from './BookForm';
import { renderWithProviders } from '@/test/renderWithProviders';

const series = [
  { id: 7, title: 'The Scale Cycle' },
  { id: 8, title: 'Letters from Blackmoor' },
];

describe('BookForm', () => {
  it('submits what was typed, standalone by default', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <BookForm
        seriesOptions={series}
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
    });
  });

  it('refuses to submit without a title or a description', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <BookForm
        seriesOptions={[]}
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
        submitLabel="Save"
        showStatus
        initialValues={{
          title: 'A Tale of Dragons',
          description: 'Long ago.',
          tags: ['epic'],
          seriesId: 7,
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
      status: 'complete',
    });
  });

  it('shows a server error and keeps what was typed', () => {
    renderWithProviders(
      <BookForm
        seriesOptions={[]}
        submitLabel="Save"
        initialValues={{
          title: 'Kept',
          description: 'Also kept',
          tags: [],
          seriesId: null,
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
        submitLabel="Save"
        isSubmitting
        onSubmit={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Save/ })).toHaveClass(
      'ant-btn-loading'
    );
  });
});
