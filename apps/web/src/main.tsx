import '@universe/tokens/css';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HomePage } from './pages/Home';
import { GamePage } from './pages/Game';
import { SetupPage } from './pages/Setup';
import { LobbyPage } from './pages/Lobby';
import { TablePage } from './pages/Table';
import { ProfilePage } from './pages/Profile';
import { SignInPage } from './pages/SignIn';
import { EndPage } from './pages/End';
import { GalleryPage } from './pages/Gallery';

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/games/:id', element: <GamePage /> },
  { path: '/games/:id/setup', element: <SetupPage /> },
  { path: '/table/:id/lobby', element: <LobbyPage /> },
  { path: '/table/:id', element: <TablePage /> },
  { path: '/table/:id/end', element: <EndPage /> },
  { path: '/profile', element: <ProfilePage /> },
  { path: '/signin', element: <SignInPage /> },
  { path: '/gallery', element: <GalleryPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
