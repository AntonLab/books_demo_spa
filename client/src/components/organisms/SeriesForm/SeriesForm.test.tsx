import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeriesForm } from './SeriesForm';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('SeriesForm', () => {
  it('submits what was typed, with no tags by default', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm submitLabel="Create series" onSubmit={onSubmit} />
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
    });
  });

  it('starts from the series being edited', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm
        submitLabel="Save"
        initialValues={{
          title: 'The Scale Cycle',
          description: 'Dragons.',
          tags: ['epic'],
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
    });
  });

  it('refuses to submit without a title or a description', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm submitLabel="Create series" onSubmit={onSubmit} />
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
        submitLabel="Save"
        error="Validation failed"
        onSubmit={jest.fn()}
      />
    );

    expect(screen.getByText('Validation failed')).toBeInTheDocument();
  });
});
