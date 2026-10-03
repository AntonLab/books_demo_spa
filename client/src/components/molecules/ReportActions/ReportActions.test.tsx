import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportActions } from './ReportActions';

const OWN = "You can't moderate your own comment";

const setup = (over = {}) => {
  const fns = { onTake: jest.fn(), onUphold: jest.fn(), onDismiss: jest.fn() };
  render(
    <ReportActions
      status="new"
      isOwnComment={false}
      disabled={false}
      {...fns}
      {...over}
    />
  );
  return fns;
};

describe('ReportActions', () => {
  it.each([
    ['new', ['Take']],
    ['in_review', ['Uphold', 'Dismiss']],
    ['upheld', []],
    ['dismissed', []],
  ] as const)('offers for %s: %j', (status, names) => {
    setup({ status });
    expect(
      screen.queryAllByRole('button').map((b) => b.getAttribute('aria-label'))
    ).toEqual(names);
  });

  it('dismisses in one click and upholds only after confirmation', async () => {
    const { onTake, onUphold, onDismiss } = setup({ status: 'in_review' });
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onTake).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Uphold' }));
    expect(onUphold).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Yes, uphold' })
    );
    expect(onUphold).toHaveBeenCalledTimes(1);
  });

  it("disables every action with the own-comment tooltip on the Moderator's own Comment", async () => {
    const { onUphold } = setup({ status: 'in_review', isOwnComment: true });
    const buttons = ['Uphold', 'Dismiss'].map((name) =>
      screen.getByRole('button', { name })
    );
    buttons.forEach((b) => expect(b).toBeDisabled());
    await userEvent.click(buttons[0]!);
    expect(onUphold).not.toHaveBeenCalled();
    await userEvent.hover(buttons[1]!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(OWN);
  });
});
