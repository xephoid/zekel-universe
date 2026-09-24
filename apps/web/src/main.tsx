import './fonts.css';
import '@universe/tokens/css';
import '@universe/primitives/css';
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
import { SignInPage, SignInCompletePage } from './pages/SignIn';
import { GalleryPage } from './pages/Gallery';
import { NotFoundPage } from './pages/NotFound';
import { DevNggPage } from './pages/DevNgg';

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
  { path: '/gallery', element: <GalleryPage /> },
  // Development only: captured NGnG views, drawn without a game.
  ...(import.meta.env.DEV ? [{ path: '/dev/ngg', element: <DevNggPage /> }] : []),
  { path: '*', element: <NotFoundPage /> },
]);

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
