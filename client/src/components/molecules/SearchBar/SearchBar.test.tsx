import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { SearchBar } from './SearchBar';
import { renderWithProviders } from '@/test/renderWithProviders';
import { appTheme } from '@/theme/tokens';

// Renders the current URL so a test can assert where the bar navigated to.
const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
};

const renderBar = (route = '/') => {
  return renderWithProviders(
    <>
      <SearchBar />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </>,
    { route }
  );
};

describe('SearchBar', () => {
  it('navigates to /search with the encoded term on submit', async () => {
    renderBar();

    await userEvent.type(
      screen.getByLabelText('Search books'),
      'dragon riders{Enter}'
    );

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/search?q=dragon%20riders'
    );
  });

  it('trims surrounding whitespace from the term', async () => {
    renderBar();

    await userEvent.type(
      screen.getByLabelText('Search books'),
      '  elf  {Enter}'
    );

    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=elf');
  });

  it('does nothing when the term is empty', async () => {
    renderBar();

    await userEvent.type(screen.getByLabelText('Search books'), '{Enter}');

    // Exact match, not toHaveTextContent: '/search?q=' contains '/' as a
    // substring, so a substring assertion here would pass even with the
    // empty-term guard deleted entirely.
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('does nothing when the term is only whitespace', async () => {
    renderBar();

    await userEvent.type(screen.getByLabelText('Search books'), '   {Enter}');

    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('caps the input at the 200 characters the server accepts', () => {
    renderBar();

    expect(screen.getByLabelText('Search books')).toHaveAttribute(
      'maxlength',
      '200'
    );
  });

  it('initialises from ?q= so it stays populated on /search', () => {
    renderBar('/search?q=dragon');

    expect(screen.getByLabelText('Search books')).toHaveValue('dragon');
  });

  it('caps its width from the quark rather than a literal', () => {
    const { container } = renderBar();

    // antd puts the `style` prop on the search wrapper, not the <input>.
    // Asserted against the token itself, not a hardcoded 400, so the test
    // follows the quark if its value ever changes.
    expect(container.querySelector('.ant-input-search')).toHaveStyle({
      maxWidth: `${appTheme.token?.appSearchBarMaxWidth}px`,
    });
  });

  it('says it searches descriptions, which is all the server matches', () => {
    renderBar();

    expect(screen.getByLabelText('Search books')).toHaveAttribute(
      'placeholder',
      'Search books by description'
    );
  });

  it('does not navigate when the clear (x) icon is clicked', async () => {
    // antd 6's Input.Search fires onSearch for its clear icon too, with
    // info.source === 'clear' — confirmed by inspecting the rendered DOM,
    // which is a <button class="ant-input-clear-icon"> inside the input's
    // suffix. Without the source==='clear' guard in SearchBar, clicking it
    // would navigate to a search for the term the user just erased.
    const { container } = renderBar('/search?q=dragon');

    const clearIcon = container.querySelector('.ant-input-clear-icon');
    expect(clearIcon).not.toBeNull();

    await userEvent.click(clearIcon as HTMLElement);

    expect(screen.getByTestId('location').textContent).toBe('/search?q=dragon');
  });
});
