import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChapterIllustrationsEditor } from './ChapterIllustrationsEditor';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ApiError } from '@/api/client';
import * as illustrationsApi from '@/api/illustrations';
import { illustrationImageUrl } from '@/types/illustration';

jest.mock('@/api/illustrations');

const mocked = jest.mocked(illustrationsApi);

const rowAt = (index: number) => ({
  id: 7 + index,
  position: index + 1,
  caption: index === 0 ? 'Cap 7' : null,
  width: null,
  height: null,
  updatedAt: '2026-10-17T10:00:00.000Z',
});
const rowsOf = (n: number) => ({
  items: Array.from({ length: n }, (_, index) => rowAt(index)),
});
const list = rowsOf(3);
const first = rowAt(0);

const user = userEvent.setup({ applyAccept: false });
const png = new File(['x'], 'pic.png', { type: 'image/png' });
const fileInput = (c: HTMLElement) =>
  c.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  jest.resetAllMocks();
  mocked.listIllustrations.mockResolvedValue(list);
});

it('lists the rows with the end moves disabled', async () => {
  const { container } = renderWithProviders(
    <ChapterIllustrationsEditor chapterId={9} />
  );
  expect(
    await screen.findByRole('heading', { name: 'Illustrations' })
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Caption of illustration 1')).toHaveValue(
    'Cap 7'
  );
  expect(
    screen.getByRole('button', { name: 'Move illustration 1 up' })
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Move illustration 3 down' })
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Move illustration 2 up' })
  ).toBeEnabled();
  expect(
    container.querySelector(`img[src="${illustrationImageUrl(first)}"]`)
  ).not.toBeNull();
});

it('uploads a picked file and reloads the list', async () => {
  mocked.uploadIllustration.mockResolvedValue(first);
  const { container } = renderWithProviders(
    <ChapterIllustrationsEditor chapterId={9} />
  );
  await screen.findByRole('button', { name: 'Add illustration' });
  await user.upload(fileInput(container), png);
  await waitFor(() =>
    expect(mocked.uploadIllustration).toHaveBeenCalledWith(9, png)
  );
  await waitFor(() =>
    expect(mocked.listIllustrations).toHaveBeenCalledTimes(2)
  );
});

it('refuses a wrong type without sending, and shows a server refusal', async () => {
  const { container } = renderWithProviders(
    <ChapterIllustrationsEditor chapterId={9} />
  );
  await screen.findByRole('button', { name: 'Add illustration' });
  await user.upload(
    fileInput(container),
    new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })
  );
  expect(
    await screen.findByText('Choose a JPEG, PNG or WebP image.')
  ).toBeInTheDocument();
  expect(mocked.uploadIllustration).not.toHaveBeenCalled();

  mocked.uploadIllustration.mockRejectedValue(
    new ApiError(409, 'A chapter holds at most 20 illustrations')
  );
  await user.upload(fileInput(container), png);
  expect(
    await screen.findByText('A chapter holds at most 20 illustrations')
  ).toBeInTheDocument();
});

it('at the cap offers no upload and says why', async () => {
  mocked.listIllustrations.mockResolvedValue(rowsOf(20));
  renderWithProviders(<ChapterIllustrationsEditor chapterId={9} />);
  expect(
    await screen.findByText(
      'This chapter holds the most illustrations it can (20).'
    )
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add illustration' })).toBeNull();
});

it('saves a caption only when changed, and a blank one as null', async () => {
  mocked.updateIllustrationCaption.mockResolvedValue(first);
  renderWithProviders(<ChapterIllustrationsEditor chapterId={9} />);
  const save = await screen.findByRole('button', {
    name: 'Save caption of illustration 1',
  });
  expect(save).toBeDisabled();
  await user.clear(screen.getByLabelText('Caption of illustration 1'));
  await user.type(screen.getByLabelText('Caption of illustration 1'), '   ');
  await user.click(save);
  expect(mocked.updateIllustrationCaption).toHaveBeenCalledWith(7, null);
  await user.type(screen.getByLabelText('Caption of illustration 2'), ' New ');
  await user.click(
    screen.getByRole('button', { name: 'Save caption of illustration 2' })
  );
  expect(mocked.updateIllustrationCaption).toHaveBeenCalledWith(8, 'New');
});

it('moves a row up, saving the whole order, and shows the new order at once', async () => {
  mocked.reorderIllustrations.mockImplementation(() => new Promise(() => {}));
  renderWithProviders(<ChapterIllustrationsEditor chapterId={9} />);
  await user.click(
    await screen.findByRole('button', { name: 'Move illustration 2 up' })
  );
  expect(mocked.reorderIllustrations).toHaveBeenCalledWith(9, [8, 7, 9]);
  await waitFor(() =>
    expect(screen.getByLabelText('Caption of illustration 1')).toHaveValue('')
  );
});

it('explains a 409 on reorder and shows the server order again', async () => {
  mocked.reorderIllustrations.mockRejectedValue(new ApiError(409, 'stale'));
  renderWithProviders(<ChapterIllustrationsEditor chapterId={9} />);
  await user.click(
    await screen.findByRole('button', { name: 'Move illustration 3 up' })
  );
  expect(
    await screen.findByText(
      'The illustrations changed since you loaded them. The list was reloaded.'
    )
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText('Caption of illustration 1')).toHaveValue(
      'Cap 7'
    )
  );
});

it('keeps the delete tooltip shut while its confirmation is open', async () => {
  renderWithProviders(<ChapterIllustrationsEditor chapterId={9} />);
  await user.click(
    await screen.findByRole('button', { name: 'Delete illustration 1' })
  );
  expect(
    await screen.findByText('Delete this illustration?')
  ).toBeInTheDocument();
  // antd keeps a closed tooltip mounted, marked hidden; the Popconfirm is a
  // role="tooltip" too, so find the tooltip by its text.
  expect(
    screen.getByText('Delete illustration 1').closest('.ant-tooltip')
  ).toHaveClass('ant-tooltip-hidden');
});

it('deletes after confirmation only', async () => {
  mocked.deleteIllustration.mockResolvedValue(undefined);
  renderWithProviders(<ChapterIllustrationsEditor chapterId={9} />);
  await user.click(
    await screen.findByRole('button', { name: 'Delete illustration 1' })
  );
  expect(
    await screen.findByText('Delete this illustration?')
  ).toBeInTheDocument();
  expect(mocked.deleteIllustration).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() =>
    expect(mocked.deleteIllustration).toHaveBeenCalledWith(7)
  );
});
