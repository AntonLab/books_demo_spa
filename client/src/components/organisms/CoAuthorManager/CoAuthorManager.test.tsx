import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AUTHOR_SEARCH_MAX_LENGTH } from 'shared';
import { CoAuthorManager } from './CoAuthorManager';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ApiError } from '@/api/client';
import * as authorsApi from '@/api/authors';
import * as booksApi from '@/api/books';
import * as seriesApi from '@/api/series';
import type { AuthorSummary } from '@/types/user';

jest.mock('@/api/authors');
jest.mock('@/api/books');
jest.mock('@/api/series');

const mockedAuthors = jest.mocked(authorsApi);
const mockedBooks = jest.mocked(booksApi);
const mockedSeries = jest.mocked(seriesApi);

const ann: AuthorSummary = {
  id: 3,
  login: 'ann',
  firstName: 'Ann',
  lastName: 'Author',
};
const cora: AuthorSummary = {
  id: 4,
  login: 'cora',
  firstName: 'Cora',
  lastName: 'Writer',
};
const ivan: AuthorSummary = {
  id: 5,
  login: 'ipetrov',
  firstName: 'Ivan',
  lastName: 'Petrov',
};

const renderManager = (
  props: Partial<Parameters<typeof CoAuthorManager>[0]> = {}
) =>
  renderWithProviders(
    <CoAuthorManager
      work={{ kind: 'book', id: 1 }}
      authors={[ann, cora]}
      viewerId={ann.id}
      canManage
      onLeave={jest.fn()}
      {...props}
    />
  );

beforeEach(() => {
  jest.resetAllMocks();
  mockedAuthors.searchAuthors.mockResolvedValue([ann, cora, ivan]);
});

describe('CoAuthorManager', () => {
  it('names every co-author, offering Remove for others and Leave for yourself', () => {
    renderManager();

    expect(screen.getByText('Ann Author')).toBeInTheDocument();
    expect(screen.getByText('Cora Writer')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });

  it('offers the last co-author no way to leave', () => {
    renderManager({ authors: [ann] });

    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
  });

  it('is read-only for someone who may not manage the byline', () => {
    renderManager({ canManage: false, viewerId: 99 });

    expect(screen.getByText('Cora Writer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('credits an author found by searching, leaving out those already credited', async () => {
    mockedBooks.addCoAuthor.mockResolvedValue({} as never);
    renderManager();

    await userEvent.type(screen.getByRole('combobox'), 'petrov');
    await waitFor(() =>
      expect(mockedAuthors.searchAuthors).toHaveBeenCalledWith('petrov')
    );

    const option = await screen.findByTitle('Ivan Petrov (ipetrov)');
    expect(screen.queryByTitle('Cora Writer (cora)')).toBeNull();
    await userEvent.click(option);

    expect(mockedBooks.addCoAuthor).toHaveBeenCalledWith(1, ivan.id);
  });

  it('stops a search term at the length the server accepts', async () => {
    renderManager();
    const tooLong = 'p'.repeat(AUTHOR_SEARCH_MAX_LENGTH + 6);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.paste(tooLong);

    const accepted = tooLong.slice(0, AUTHOR_SEARCH_MAX_LENGTH);
    await waitFor(() =>
      expect(mockedAuthors.searchAuthors).toHaveBeenCalledWith(accepted)
    );
    expect(mockedAuthors.searchAuthors).not.toHaveBeenCalledWith(tooLong);
    expect(screen.getByRole('combobox')).toHaveValue(accepted);
  });

  it('removes another co-author', async () => {
    mockedBooks.removeCoAuthor.mockResolvedValue({} as never);
    renderManager();

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(mockedBooks.removeCoAuthor).toHaveBeenCalledWith(1, cora.id);
  });

  it('leaves the book only once asked, and hands off once the server agrees', async () => {
    mockedBooks.removeCoAuthor.mockResolvedValue({} as never);
    const onLeave = jest.fn();
    renderManager({ onLeave });

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Leave this book?')).toBeInTheDocument();
    expect(mockedBooks.removeCoAuthor).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, leave' }));

    expect(mockedBooks.removeCoAuthor).toHaveBeenCalledWith(1, ann.id);
    await waitFor(() => expect(onLeave).toHaveBeenCalled());
  });

  it("manages a series' byline through the series, not the books", async () => {
    mockedSeries.addSeriesCoAuthor.mockResolvedValue({} as never);
    mockedSeries.removeSeriesCoAuthor.mockResolvedValue({} as never);
    renderManager({ work: { kind: 'series', id: 7 } });

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mockedSeries.removeSeriesCoAuthor).toHaveBeenCalledWith(7, cora.id);

    await userEvent.type(screen.getByRole('combobox'), 'petrov');
    await userEvent.click(await screen.findByTitle('Ivan Petrov (ipetrov)'));
    expect(mockedSeries.addSeriesCoAuthor).toHaveBeenCalledWith(7, ivan.id);

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Leave this series?')).toBeInTheDocument();
    expect(mockedBooks.removeCoAuthor).not.toHaveBeenCalled();
  });

  it('shows the reason the server refused', async () => {
    mockedBooks.removeCoAuthor.mockRejectedValue(
      new ApiError(403, 'Only a co-author may remove a co-author')
    );
    renderManager();

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(
      await screen.findByText('Only a co-author may remove a co-author')
    ).toBeInTheDocument();
  });
});
