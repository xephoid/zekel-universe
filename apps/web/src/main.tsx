import './fonts.css';
import '@zekel/tokens/css';
import '@zekel/primitives/css';
import '@zekel/glue-kit/css';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SessionProvider } from './session';
import { HomePage } from './pages/Home';
import { GamePage } from './pages/Game';
import { RulesPage } from './pages/Rules';
import { MyTablesPage } from './pages/MyTables';
import { DesignerPage, DesignersPage } from './pages/Designer';
import { WatchPage } from './pages/Watch';
import { SetupPage } from './pages/Setup';
import { LobbyPage } from './pages/Lobby';
import { TablePage } from './pages/Table';
import { ProfilePage } from './pages/Profile';
import { SignInPage, SignInCompletePage, SignInCallbackPage } from './pages/SignIn';
import { GalleryPage } from './pages/Gallery';
import { NotFoundPage } from './pages/NotFound';
import { startAnalytics, trackPageview } from './analytics';

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/games/:id', element: <GamePage /> },
  { path: '/games/:id/setup', element: <SetupPage /> },
  { path: '/games/:id/rules', element: <RulesPage /> },
  { path: '/tables', element: <MyTablesPage /> },
  { path: '/designers', element: <DesignersPage /> },
  { path: '/designers/:slug', element: <DesignerPage /> },
  { path: '/table/:id/watch', element: <WatchPage /> },
  { path: '/table/:id/lobby', element: <LobbyPage /> },
  { path: '/table/:id', element: <TablePage /> },
  { path: '/profile', element: <ProfilePage /> },
  { path: '/signin', element: <SignInPage /> },
  { path: '/signin/complete', element: <SignInCompletePage /> },
  { path: '/auth/callback', element: <SignInCallbackPage /> },
  { path: '/gallery', element: <GalleryPage /> },
  // The admin page loads on its own: players never download it.
  { path: '/admin', lazy: () => import('./pages/Admin').then((m) => ({ Component: m.AdminPage })) },
  // Development only: captured NGnG views, drawn without a game. Loaded
  // lazily inside the dev-only branch, so a production build drops the page
  // and every captured view with it.
  ...(import.meta.env.DEV
    ? [
        { path: '/dev/ngg', lazy: () => import('./pages/DevNgg').then((m) => ({ Component: m.DevNggPage })) },
        { path: '/dev/ao', lazy: () => import('./pages/DevAo').then((m) => ({ Component: m.DevAoPage })) },
        { path: '/dev/ww', lazy: () => import('./pages/DevWw').then((m) => ({ Component: m.DevWwPage })) },
      ]
    : []),
  { path: '*', element: <NotFoundPage /> },
]);

// Analytics: off unless the server says otherwise. One pageview for the
// first page, then one per route change (the router changes pages without
// reloading). Only the path counts as a change, not a query or fragment.
void startAnalytics();
let lastPath = router.state.location.pathname;
trackPageview(lastPath);
router.subscribe((state) => {
  if (state.location.pathname === lastPath) return;
  lastPath = state.location.pathname;
  trackPageview(lastPath);
});

// The theme follows the OS unless the person picked one in settings.
try {
  const theme = localStorage.getItem('universe:theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset['theme'] = theme;
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset['theme'] = 'dark';
} catch { /* storage unavailable */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
);
