---
paths:
  - 'client/src/components/templates/**'
---

# Loading and errors (`App.tsx`)

1. **Lazy-load every page, and only pages.** `AppHeader` and the `AuthModals`
   it holds render on every route and stay static.
2. **Remap the named export**:
   `lazy(() => import('@/pages/MainPage/MainPage').then((m) => ({ default: m.MainPage })))`.
   Pages keep named exports; do not add a default to shorten this.
3. **One `<Suspense>` and one `<ErrorBoundary>` around `<Routes>`**, inside
   `Layout.Content`, so the header and modals stay mounted while a chunk loads
   or a page throws. Add a per-route boundary only when a page needs its own
   recovery UI.
4. **Key the boundary by route** (`key={useLocation().pathname}`), or a caught
   error persists across every later navigation. The Profile routes share
   one key, and so do the Admin routes: a key per tab would remount
   `ProfilePage` or `AdminPage` on every tab click.
5. `QueryClientProvider` is the outermost provider, then the Redux
   `Provider`, then `StyleProvider` and `ThemedConfigProvider` (antd's
   algorithm from Device preferences). `AppShell` is exported apart from `App`
   because `App` mounts `BrowserRouter`, which a route test cannot point at an
   arbitrary path.
