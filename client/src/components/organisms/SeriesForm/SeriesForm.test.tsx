import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import type { FormInstance } from 'antd';
import type { FC } from 'react';
import { SeriesForm } from './SeriesForm';
import type { SeriesFieldValues } from './SeriesForm';
import { renderWithProviders } from '@/test/renderWithProviders';

const genres = [
  { id: 4, name: 'Gothic' },
  { id: 5, name: 'Hard SF' },
];

// antd draws the clear icon inside the select that wraps the labelled input.
const clearSelect = async (label: string) => {
  const select = screen.getByLabelText(label).closest('.ant-select');
  await userEvent.click(select!.querySelector('.ant-select-clear')!);
};

describe('SeriesForm', () => {
  it('fills the form instance it is given, so a caller can read its state', async () => {
    let captured: FormInstance<SeriesFieldValues> | undefined;
    const Harness: FC = () => {
      const [form] = Form.useForm<SeriesFieldValues>();
      captured = form;
      return (
        <SeriesForm
          form={form}
          genreOptions={[]}
          submitLabel="Create series"
          onSubmit={jest.fn()}
        />
      );
    };
    renderWithProviders(<Harness />);
    expect(captured?.isFieldsTouched()).toBe(false);

    await userEvent.type(screen.getByLabelText('Title'), 'x');

    expect(captured?.isFieldsTouched()).toBe(true);
  });

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

  it('shows the Genre placeholder and submits null for an untouched Genre', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm
        genreOptions={genres}
        submitLabel="Create series"
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText('No genre')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Title'), 'The Scale Cycle');
    await userEvent.type(screen.getByLabelText('Description'), 'Dragons.');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create series' })
    );

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'The Scale Cycle',
      description: 'Dragons.',
      tags: [],
      genreId: null,
    });
  });

  it('submits null explicitly for a cleared Genre when editing', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <SeriesForm
        genreOptions={genres}
        submitLabel="Save"
        initialValues={{
          title: 'The Scale Cycle',
          description: 'Dragons.',
          tags: ['epic'],
          genreId: 4,
        }}
        onSubmit={onSubmit}
      />
    );

    await clearSelect('Genre');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'The Scale Cycle',
      description: 'Dragons.',
      tags: ['epic'],
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
