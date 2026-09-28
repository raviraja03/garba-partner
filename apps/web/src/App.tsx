import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider } from './features/auth/AuthProvider';
import { PublicOnly, RequireAuth } from './features/auth/guards';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { VerifyOtpPage } from './pages/VerifyOtpPage';

const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/login/verify', element: <VerifyOtpPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [{ path: '/', element: <HomePage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
