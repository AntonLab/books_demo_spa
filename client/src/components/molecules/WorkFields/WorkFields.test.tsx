import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Form } from 'antd';
import { NO_GENRE, WorkFields } from './WorkFields';
import { renderWithProviders } from '@/test/renderWithProviders';

const GENRES = [{ id: 3, name: 'Fantasy' }];

describe('WorkFields', () => {
  it('renders the shared fields with the extra ones between tags and Genre', () => {
    renderWithProviders(
      <Form>
        <WorkFields genreOptions={GENRES}>
          <span>extra</span>
        </WorkFields>
      </Form>
    );

    const labels = ['Title', 'Description', 'Tags', 'Genre'].map((label) =>
      screen.getByLabelText(label)
    );
    const extra = screen.getByText('extra');
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(follows(labels[2]!, extra)).toBe(true);
    expect(follows(extra, labels[3]!)).toBe(true);
  });

  it('offers "No genre" as the 0 option beside every Genre', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Form initialValues={{ genreId: NO_GENRE }}>
        <WorkFields genreOptions={GENRES} />
      </Form>
    );

    expect(screen.getByText('No genre')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Genre'));
    expect(await screen.findByText('Fantasy')).toBeInTheDocument();
  });

  it('refuses a blank title and description', async () => {
    const user = userEvent.setup();
    const onFinish = jest.fn();
    renderWithProviders(
      <Form onFinish={onFinish}>
        <WorkFields genreOptions={GENRES} />
        <Button htmlType="submit">Save</Button>
      </Form>
    );

    await user.type(screen.getByLabelText('Title'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter a title')).toBeInTheDocument();
    expect(await screen.findByText('Enter a description')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });
});
