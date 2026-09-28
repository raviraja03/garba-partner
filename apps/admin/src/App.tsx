import { createBrowserRouter, Link, RouterProvider } from 'react-router';
import { AdminAuthProvider } from './features/auth/AdminAuthProvider';
import { PublicOnly, RequireAdmin } from './features/auth/guards';
import { AdminLayout } from './pages/AdminLayout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-extrabold">Page not found</h1>
      <Link to="/" className="mt-4 font-semibold text-brand-700 hover:underline">
        Back to dashboard
      </Link>
    </main>
  );
}

const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <RequireAdmin />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          {
            element: <RequireAdmin permission="dashboard:view" />,
            children: [{ path: '/', element: <DashboardPage /> }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function App() {
  return (
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  );
}
