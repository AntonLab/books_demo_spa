import { render, screen } from '@testing-library/react';
import { TagList } from './TagList';

describe('TagList', () => {
  it('lists every tag as a list item', () => {
    render(<TagList tags={['gothic', 'slow burn']} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'gothic',
      'slow burn',
    ]);
  });

  it('renders nothing without tags', () => {
    const { container } = render(<TagList tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
