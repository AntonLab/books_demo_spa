import type { FC } from 'react';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigationType } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import { GoneRedirect } from './GoneRedirect';

const Probe: FC = () => (
  <p>{`${useLocation().pathname}|${useNavigationType()}`}</p>
);

describe('GoneRedirect', () => {
  it('replaces to Home with the message by default', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/gone" element={<GoneRedirect message="Gone." />} />
        <Route path="*" element={<Probe />} />
      </Routes>,
      { route: '/gone' }
    );
    expect(await screen.findByText('/|REPLACE')).toBeInTheDocument();
    expect(await screen.findAllByText('Gone.')).toHaveLength(1);
  });

  it('replaces to the given path', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/gone"
          element={<GoneRedirect message="Gone." to="/books/3" />}
        />
        <Route path="*" element={<Probe />} />
      </Routes>,
      { route: '/gone' }
    );
    expect(await screen.findByText('/books/3|REPLACE')).toBeInTheDocument();
  });
});
