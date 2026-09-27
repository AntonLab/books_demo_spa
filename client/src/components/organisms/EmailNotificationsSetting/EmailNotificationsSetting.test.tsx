import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailNotificationsSetting } from './EmailNotificationsSetting';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ApiError } from '@/api/client';
import * as notificationsApi from '@/api/notifications';

jest.mock('@/api/notifications');
const mockedNotifications = jest.mocked(notificationsApi);

beforeEach(() => {
  jest.resetAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EmailNotificationsSetting', () => {
  it('shows the stored switch under its label', async () => {
    mockedNotifications.getNotificationSettings.mockResolvedValue({
      emailNotifications: true,
    });

    renderWithProviders(<EmailNotificationsSetting />);

    const toggle = await screen.findByRole('switch', {
      name: 'Email notifications',
    });
    await waitFor(() => expect(toggle).toBeChecked());
    // The anchor every announcement email links to.
    expect(toggle).toHaveAttribute('id', 'email-notifications');
  });

  it('turns email off and shows what the server stored', async () => {
    mockedNotifications.getNotificationSettings.mockResolvedValue({
      emailNotifications: true,
    });
    mockedNotifications.updateNotificationSettings.mockResolvedValue({
      emailNotifications: false,
    });

    renderWithProviders(<EmailNotificationsSetting />);
    const toggle = await screen.findByRole('switch', {
      name: 'Email notifications',
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);

    expect(mockedNotifications.updateNotificationSettings).toHaveBeenCalledWith(
      { emailNotifications: false }
    );
    await waitFor(() => expect(toggle).not.toBeChecked());
    // Once: the PATCH answer goes into the cache, no refetch.
    expect(mockedNotifications.getNotificationSettings).toHaveBeenCalledTimes(
      1
    );
  });

  it('keeps the old state and says so when the change is refused', async () => {
    mockedNotifications.getNotificationSettings.mockResolvedValue({
      emailNotifications: true,
    });
    mockedNotifications.updateNotificationSettings.mockRejectedValue(
      new ApiError(500, 'boom')
    );

    renderWithProviders(<EmailNotificationsSetting />);
    const toggle = await screen.findByRole('switch', {
      name: 'Email notifications',
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);

    expect(
      await screen.findByText('Could not save your notification settings.')
    ).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });

  it('reports settings that will not load and offers no switch to flip', async () => {
    mockedNotifications.getNotificationSettings.mockRejectedValue(
      new ApiError(500, 'boom')
    );

    renderWithProviders(<EmailNotificationsSetting />);

    expect(
      await screen.findByText('Could not load your notification settings.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Email notifications' })
    ).toBeDisabled();
  });

  it('scrolls itself into view when the address names it', async () => {
    const scroll = jest.spyOn(Element.prototype, 'scrollIntoView');
    mockedNotifications.getNotificationSettings.mockResolvedValue({
      emailNotifications: true,
    });

    renderWithProviders(<EmailNotificationsSetting />, {
      route: '/profile#email-notifications',
    });

    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
  });

  it('leaves the scroll alone on a plain profile address', async () => {
    const scroll = jest.spyOn(Element.prototype, 'scrollIntoView');
    mockedNotifications.getNotificationSettings.mockResolvedValue({
      emailNotifications: true,
    });

    renderWithProviders(<EmailNotificationsSetting />, { route: '/profile' });

    await screen.findByRole('switch', { name: 'Email notifications' });
    await waitFor(() =>
      expect(mockedNotifications.getNotificationSettings).toHaveBeenCalled()
    );
    expect(scroll).not.toHaveBeenCalled();
  });
});
