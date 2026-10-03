import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Form } from 'antd';
import { WorkFields } from './WorkFields';
import { renderWithProviders } from '@/test/renderWithProviders';
import { genreItem } from '@/test/genres';

const GENRES = [genreItem(3, 'Fantasy')];

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

  it('shows "No genre" as the placeholder and lists only real genres', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Form>
        <WorkFields genreOptions={GENRES} />
      </Form>
    );

    expect(screen.getByText('No genre')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Genre'));
    expect(await screen.findByText('Fantasy')).toBeInTheDocument();
    expect(screen.getAllByText('No genre')).toHaveLength(1);
  });

  it('submits a Subgenre as its id and shows its path', async () => {
    const user = userEvent.setup();
    const onFinish = jest.fn();
    renderWithProviders(
      <Form
        onFinish={onFinish}
        initialValues={{ title: 'T', description: 'D' }}
      >
        <WorkFields
          genreOptions={[genreItem(3, 'Fantasy'), genreItem(4, 'Urban', 3)]}
        />
        <Button htmlType="submit">Save</Button>
      </Form>
    );

    await user.click(screen.getByLabelText('Genre'));
    await user.click(await screen.findByText('Urban'));
    expect(await screen.findByTitle('Fantasy / Urban')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onFinish).toHaveBeenCalledWith(
        expect.objectContaining({ genreId: 4 })
      )
    );
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
