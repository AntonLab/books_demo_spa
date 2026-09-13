import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useParams } from 'react-router';
import { NewSeriesPage } from './NewSeriesPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as seriesApi from '@/api/series';
import type { PublicSeries } from '@/types/series';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/series');

const mockedSeries = jest.mocked(seriesApi);

const author: PublicUser = {
  id: 3,
  login: 'ann',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const created: PublicSeries = {
  id: 12,
  authors: [{ id: 3, login: 'ann', firstName: 'Ann', lastName: 'Author' }],
  title: 'The Scale Cycle',
  description: 'Dragons, in four parts.',
  tags: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// Stands in for the edit route, so a test can see where creating leads.
const EditTarget = () => <p>Editing series {useParams().id}</p>;

const renderPage = (session: PublicUser | null = author) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(
    <Routes>
      <Route path="/series/new" element={<NewSeriesPage />} />
      <Route path="/series/:id/edit" element={<EditTarget />} />
    </Routes>,
    { route: '/series/new', queryClient }
  );
};

const fillAndSubmit = async () => {
  await userEvent.type(screen.getByLabelText('Title'), 'The Scale Cycle');
  await userEvent.type(
    screen.getByLabelText('Description'),
    'Dragons, in four parts.'
  );
  await userEvent.click(screen.getByRole('button', { name: 'Create series' }));
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('NewSeriesPage', () => {
  it('creates the series and moves on to editing it', async () => {
    mockedSeries.createSeries.mockResolvedValue(created);
    renderPage();

    await fillAndSubmit();

    expect(mockedSeries.createSeries).toHaveBeenCalledWith({
      title: 'The Scale Cycle',
      description: 'Dragons, in four parts.',
      tags: [],
    });
    expect(await screen.findByText('Editing series 12')).toBeInTheDocument();
  });

  it('keeps the form and shows why the server refused', async () => {
    mockedSeries.createSeries.mockRejectedValue(
      new ApiError(400, 'Validation failed')
    );
    renderPage();

    await fillAndSubmit();

    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('The Scale Cycle');
  });

  it('offers no form to an account that is not an author', async () => {
    renderPage({ ...author, role: 'user' });

    expect(
      screen.getByText(
        'Only an account holding the author role can create series.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
    await waitFor(() =>
      expect(mockedSeries.createSeries).not.toHaveBeenCalled()
    );
  });
});
