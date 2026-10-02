import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import { usePageGuard, type PageAccess } from './usePageGuard';

const Probe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}|{JSON.stringify(location.state)}
    </div>
  );
};

const Guarded = ({ access }: { access: PageAccess }) =>
  usePageGuard(access) ? <p>secret</p> : <p>waiting</p>;

const renderAt = (access: PageAccess) =>
  renderWithProviders(
    <Routes>
      <Route path="/" element={<Probe />} />
      <Route path="/private" element={<Guarded access={access} />} />
    </Routes>,
    { route: '/private?tab=2' }
  );

describe('usePageGuard', () => {
  it('renders the page when allowed', () => {
    renderAt('allowed');
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('waits without redirecting while pending', () => {
    renderAt('pending');
    expect(screen.getByText('waiting')).toBeInTheDocument();
    expect(screen.queryByTestId('location')).toBeNull();
  });

  it('sends a denied Account home with one access popup', async () => {
    renderAt('denied');
    expect(await screen.findByTestId('location')).toHaveTextContent('/|');
    expect(
      await screen.findAllByText("You don't have access to this page.")
    ).toHaveLength(1);
  });

  it('sends a Guest home carrying the URL to return to', async () => {
    renderAt('guest');
    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/|{"loginReturnTo":"/private?tab=2"}'
    );
  });
});
