import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReportedAccount } from 'shared';
import { ReportedAccountCell } from './ReportedAccountCell';

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
    await userEvent.click(button);
    expect(onBan).not.toHaveBeenCalled();
  });

  it('disables Ban user while pending', () => {
    setup({ pending: true });
    expect(screen.getByRole('button', { name: 'Ban user' })).toBeDisabled();
  });
});
