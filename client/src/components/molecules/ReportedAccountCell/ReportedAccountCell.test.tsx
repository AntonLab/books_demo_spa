import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReportedAccount } from 'shared';
import { ReportedAccountCell } from './ReportedAccountCell';
import { renderWithProviders as render } from '@/test/renderWithProviders';

const account = (over: Partial<ReportedAccount> = {}): ReportedAccount => ({
  id: 4,
  login: 'Writer',
  status: 'active',
  role: 'user',
  atBanThreshold: false,
  ...over,
});

const setup = (over = {}) => {
  const onBan = jest.fn();
  render(
    <ReportedAccountCell
      account={account()}
      blockedReason={null}
      pending={false}
      onBan={onBan}
      {...over}
    />
  );
  return onBan;
};

describe('ReportedAccountCell', () => {
  it('names a deleted Account and offers no Ban user', () => {
    setup({ account: null });
    expect(screen.getByText('Deleted account')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links the login to the public profile', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Writer' })).toHaveAttribute(
      'href',
      '/accounts/4'
    );
  });

  it('shows the login, and the Ban mark only at the threshold', () => {
    const { unmount } = render(
      <ReportedAccountCell
        account={account({ atBanThreshold: true })}
        blockedReason={null}
        pending={false}
        onBan={jest.fn()}
      />
    );
    expect(screen.getByText('Writer')).toBeInTheDocument();
    expect(screen.getByText('Ban mark')).toBeInTheDocument();
    unmount();
    setup();
    expect(screen.queryByText('Ban mark')).toBeNull();
  });

  it('bans only after the confirm', async () => {
    const onBan = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Ban user' }));
    expect(await screen.findByText('Ban Writer?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, ban' }));
    expect(onBan).toHaveBeenCalledTimes(1);
  });

  it('does not ban when the confirm is cancelled', async () => {
    const onBan = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Ban user' }));
    await screen.findByText('Ban Writer?');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onBan).not.toHaveBeenCalled();
  });

  it('keeps Ban user disabled with a blocked reason', async () => {
    const onBan = setup({ blockedReason: 'Already banned' });
    const button = screen.getByRole('button', { name: 'Ban user' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onBan).not.toHaveBeenCalled();
    expect(screen.queryByText('Ban Writer?')).toBeNull();
  });

  it('shows the blocked reason on hover of the disabled Ban user', async () => {
    setup({ blockedReason: 'Already banned' });
    const wrapper = screen.getByRole('button', {
      name: 'Ban user',
    }).parentElement!;
    await userEvent.hover(wrapper);
    expect(await screen.findByText('Already banned')).toBeInTheDocument();
  });

  it('disables Ban user while pending', () => {
    setup({ pending: true });
    expect(screen.getByRole('button', { name: 'Ban user' })).toBeDisabled();
  });
});
