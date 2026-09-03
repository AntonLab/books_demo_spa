import { render, screen } from '@testing-library/react';
import { ConfigProvider, theme } from 'antd';
import type { FC } from 'react';
import { appTheme } from './tokens';

// Reads the merged token set the way a real component does.
const TokenProbe: FC = () => {
  const { token } = theme.useToken();
  return (
    <>
      <span data-testid="custom">{String(token.appSearchBarMaxWidth)}</span>
      <span data-testid="builtin">{String(token.margin)}</span>
    </>
  );
};

describe('appTheme', () => {
  // antd derives its own tokens into one flat object and does not know about
  // ours, so this asserts the custom quark actually survives that pipeline
  // rather than being dropped or turned into a CSS-var string.
  it('exposes the custom quark through theme.useToken()', () => {
    render(
      <ConfigProvider theme={appTheme}>
        <TokenProbe />
      </ConfigProvider>
    );

    expect(screen.getByTestId('custom')).toHaveTextContent('400');
  });

  it('leaves antd’s own tokens intact alongside it', () => {
    render(
      <ConfigProvider theme={appTheme}>
        <TokenProbe />
      </ConfigProvider>
    );

    expect(screen.getByTestId('builtin')).toHaveTextContent('16');
  });
});
