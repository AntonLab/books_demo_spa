import { screen, waitFor } from '@testing-library/react';
import { ChapterIllustrations } from './ChapterIllustrations';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ApiError } from '@/api/client';
import * as illustrationsApi from '@/api/illustrations';
import { illustrationImageUrl } from '@/types/illustration';

jest.mock('@/api/illustrations');

const mocked = jest.mocked(illustrationsApi);

const row = (id: number, position: number, caption: string | null) => ({
  id,
  position,
  caption,
  width: null,
  height: null,
  updatedAt: '2026-10-17T10:00:00.000Z',
});
const srcs = (container: HTMLElement) =>
  [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));

beforeEach(() => {
  jest.resetAllMocks();
});

it('shows the pictures in list order with their captions below, and no empty caption', async () => {
  mocked.listIllustrations.mockResolvedValue({
    items: [row(7, 1, 'First'), row(4, 2, null), row(9, 3, 'Third')],
  });
  const { container } = renderWithProviders(
    <ChapterIllustrations chapterId={9} />
  );

  expect(await screen.findByText('First')).toBeInTheDocument();
  expect(srcs(container)).toEqual(
    [7, 4, 9].map((id) => illustrationImageUrl(row(id, 1, null)))
  );
  expect(container.querySelectorAll('figcaption')).toHaveLength(2);
  expect(
    container.querySelectorAll('figure')[1]?.querySelector('figcaption')
  ).toBeNull();
  expect([...container.querySelectorAll('img')].map((img) => img.alt)).toEqual([
    'Illustration 1',
    'Illustration 2',
    'Illustration 3',
  ]);
  expect(mocked.listIllustrations).toHaveBeenCalledWith(9);
});

it('sets width and height on the img when the item has both', async () => {
  mocked.listIllustrations.mockResolvedValue({
    items: [{ ...row(7, 1, null), width: 400, height: 1600 }],
  });
  const { container } = renderWithProviders(
    <ChapterIllustrations chapterId={9} />
  );
  await waitFor(() =>
    expect(container.querySelector('img')).toBeInTheDocument()
  );
  const img = container.querySelector('img')!;
  expect(img.getAttribute('width')).toBe('400');
  expect(img.getAttribute('height')).toBe('1600');
});

it('sets neither attribute for a null size or a half-known one', async () => {
  mocked.listIllustrations.mockResolvedValue({
    items: [
      row(7, 1, null),
      { ...row(8, 2, null), width: 400, height: null },
      { ...row(9, 3, null), width: null, height: 1600 },
    ],
  });
  const { container } = renderWithProviders(
    <ChapterIllustrations chapterId={9} />
  );
  await waitFor(() =>
    expect(container.querySelectorAll('img')).toHaveLength(3)
  );
  for (const img of container.querySelectorAll('img')) {
    expect(img.hasAttribute('width')).toBe(false);
    expect(img.hasAttribute('height')).toBe(false);
  }
});

it('keeps a 1x1 size (no falsy check)', async () => {
  mocked.listIllustrations.mockResolvedValue({
    items: [{ ...row(7, 1, null), width: 1, height: 1 }],
  });
  const { container } = renderWithProviders(
    <ChapterIllustrations chapterId={9} />
  );
  await waitFor(() =>
    expect(container.querySelector('img')?.getAttribute('width')).toBe('1')
  );
});

it('renders nothing for an empty list', async () => {
  mocked.listIllustrations.mockResolvedValue({ items: [] });
  const { container } = renderWithProviders(
    <ChapterIllustrations chapterId={9} />
  );
  await waitFor(() => expect(mocked.listIllustrations).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

it('renders nothing, and no error, when the list fails', async () => {
  mocked.listIllustrations.mockRejectedValue(new ApiError(404, 'Not found'));
  const { container } = renderWithProviders(
    <ChapterIllustrations chapterId={9} />
  );
  await waitFor(() => expect(mocked.listIllustrations).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole('alert')).toBeNull();
});
