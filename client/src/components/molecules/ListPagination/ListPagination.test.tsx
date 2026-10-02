import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListPagination } from './ListPagination';

describe('ListPagination', () => {
  it('hides when everything fits on one page of the smallest size', () => {
    const { container } = render(
      <ListPagination
        current={1}
        pageSize={50}
        total={20}
        onChange={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers 20, 50 and 100 per page', async () => {
    render(
      <ListPagination
        current={1}
        pageSize={20}
        total={45}
        onChange={jest.fn()}
      />
    );
    await userEvent.click(screen.getByRole('combobox'));
    for (const size of ['20 / page', '50 / page', '100 / page']) {
      // The selected size shows twice: in the selector and in the list.
      expect(await screen.findAllByTitle(size)).not.toHaveLength(0);
    }
  });

  it('goes back to page 1 when the size changes', async () => {
    const onChange = jest.fn();
    render(
      <ListPagination
        current={3}
        pageSize={20}
        total={145}
        onChange={onChange}
      />
    );
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByTitle('50 / page'));
    expect(onChange).toHaveBeenLastCalledWith(1, 50);
  });
});
