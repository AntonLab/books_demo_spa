import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { READING_LIST_TITLE_MAX_LENGTH } from 'shared';
import { ReadingListForm } from './ReadingListForm';

describe('ReadingListForm', () => {
  it('submits a title alone, with an empty Description and no Tags', async () => {
    const onSubmit = jest.fn();
    render(<ReadingListForm submitLabel="Save" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Cold nights');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Cold nights',
      description: '',
      tags: [],
    });
  });

  it('refuses a blank title and does not submit', async () => {
    const onSubmit = jest.fn();
    render(<ReadingListForm submitLabel="Save" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a title')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('caps the title at the shared limit and fills from initialValues', () => {
    render(
      <ReadingListForm
        submitLabel="Save"
        onSubmit={jest.fn()}
        initialValues={{ title: 'Old', description: 'Why', tags: ['cosy'] }}
      />
    );
    expect(screen.getByLabelText('Title')).toHaveAttribute(
      'maxlength',
      String(READING_LIST_TITLE_MAX_LENGTH)
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Old');
    expect(screen.getByLabelText('Description')).toHaveValue('Why');
    expect(screen.getByText('cosy')).toBeInTheDocument();
  });

  it('shows a server refusal above the fields', () => {
    render(
      <ReadingListForm
        submitLabel="Save"
        onSubmit={jest.fn()}
        error="Too many tags"
      />
    );
    expect(screen.getByText('Too many tags')).toBeInTheDocument();
  });
});
