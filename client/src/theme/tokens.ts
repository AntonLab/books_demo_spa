import type { ThemeConfig } from 'antd';

// Quarks: the design tokens the whole app reads through `theme.useToken()`.
//
// antd 6 ships no token for how wide a control may grow — its size tokens
// cover spacing, typography, radii and control *height* only (see
// `AliasToken`, which has `controlHeight` but nothing for width). Atomic
// Design rule 4 says a value like that becomes a real quark rather than a
// literal in a component, so it is declared here and merged into antd's own
// token set below.
//
// The `app` prefix keeps our quarks out of antd's namespace: antd derives its
// tokens into the same flat object, so an unprefixed name could collide with
// one a future antd version adds.
declare module 'antd/es/theme/interface' {
  interface AliasToken {
    /** Widest the header's search field is allowed to grow. */
    appSearchBarMaxWidth: number;
  }
}

export const appTheme: ThemeConfig = {
  token: {
    appSearchBarMaxWidth: 400,
  },
};
