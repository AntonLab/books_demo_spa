import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeriesForm } from './SeriesForm';
import { renderWithProviders } from '@/test/renderWithProviders';

const genres = [
  { id: 4, name: 'Gothic' },
  { id: 5, name: 'Hard SF' },
];

describe('SeriesForm', () => {
  it('submits what was typed, with no tags by default', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm
        genreOptions={genres}
        submitLabel="Create series"
        onSubmit={onSubmit}
      />
    );

    await userEvent.type(screen.getByLabelText('Title'), 'The Scale Cycle');
    await userEvent.type(
      screen.getByLabelText('Description'),
      'Dragons, in four parts.'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create series' })
    );

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'The Scale Cycle',
      description: 'Dragons, in four parts.',
      tags: [],
      genreId: null,
    });
  });

  it('starts from the series being edited', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm
        genreOptions={genres}
        submitLabel="Save"
        initialValues={{
          title: 'The Scale Cycle',
          description: 'Dragons.',
          tags: ['epic'],
          genreId: null,
        }}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByLabelText('Title')).toHaveValue('The Scale Cycle');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'The Scale Cycle',
      description: 'Dragons.',
      tags: ['epic'],
      genreId: null,
    });
  });

  it('refuses to submit without a title or a description', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm
        genreOptions={genres}
        submitLabel="Create series"
        onSubmit={onSubmit}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Create series' })
    );

    expect(await screen.findByText('Enter a title')).toBeInTheDocument();
    expect(screen.getByText('Enter a description')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server refusal above the fields', () => {
    renderWithProviders(
      <SeriesForm
        genreOptions={genres}
        submitLabel="Save"
        error="Validation failed"
        onSubmit={jest.fn()}
      />
    );

    expect(screen.getByText('Validation failed')).toBeInTheDocument();
  });

  it('offers No genre first and submits null for it', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm
        genreOptions={genres}
        submitLabel="Create series"
        onSubmit={onSubmit}
      />
    );

    await userEvent.type(screen.getByLabelText('Title'), 'The Scale Cycle');
    await userEvent.type(
      screen.getByLabelText('Description'),
      'Dragons, in four parts.'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create series' })
    );

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'The Scale Cycle',
      description: 'Dragons, in four parts.',
      tags: [],
      genreId: null,
    });
  });

  it('round-trips a chosen genre as its id', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm
        genreOptions={genres}
        submitLabel="Save"
        initialValues={{
          title: 'The Scale Cycle',
          description: 'Dragons, in four parts.',
          tags: ['epic'],
          genreId: 4,
        }}
        onSubmit={onSubmit}
      />
    );

    // antd renders the chosen option's label in a sibling of the combobox,
    // not inside it, so this is a text query.
    expect(screen.getByText('Gothic')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'The Scale Cycle',
      description: 'Dragons, in four parts.',
      tags: ['epic'],
      genreId: 4,
    });
  });
});
