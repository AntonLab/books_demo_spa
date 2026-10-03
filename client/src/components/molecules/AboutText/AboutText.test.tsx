import { render } from '@testing-library/react';
import { AboutText } from './AboutText';

describe('AboutText', () => {
  it('keeps the line breaks of the text', () => {
    const { container } = render(<AboutText text={'line one\nline two'} />);

    expect(container.firstElementChild?.textContent).toBe('line one\nline two');
  });
});
