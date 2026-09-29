import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Link, RouterProvider } from 'react-router';
import { AdminAuthProvider } from './features/auth/AdminAuthProvider';
import { PublicOnly, RequireAdmin } from './features/auth/guards';
import { ApiClientError } from './lib/api-client';
import { AdminLayout } from './pages/AdminLayout';
import { DashboardPage } from './pages/DashboardPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EditEventPage, NewEventPage } from './pages/EventFormPage';
import { EventsPage } from './pages/EventsPage';
import { LoginPage } from './pages/LoginPage';
import { EditOrganizerPage, NewOrganizerPage, OrganizerDetailPage } from './pages/OrganizerPages';
import { OrganizersPage } from './pages/OrganizersPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { UsersPage } from './pages/UsersPage';

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (failureCount, error) =>
        !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) &&
        failureCount < 2,
    },
  },
});

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
          {
            element: <RequireAdmin permission="users:view" />,
            children: [
              { path: '/users', element: <UsersPage /> },
              { path: '/users/:userId', element: <UserDetailPage /> },
            ],
          },
          {
            element: <RequireAdmin permission="events:view" />,
            children: [
              { path: '/events', element: <EventsPage /> },
              { path: '/events/:eventId', element: <EventDetailPage /> },
              { path: '/organizers', element: <OrganizersPage /> },
              { path: '/organizers/:organizerId', element: <OrganizerDetailPage /> },
            ],
          },
          {
            element: <RequireAdmin permission="events:manage" />,
            children: [
              { path: '/events/new', element: <NewEventPage /> },
              { path: '/events/:eventId/edit', element: <EditEventPage /> },
              { path: '/organizers/new', element: <NewOrganizerPage /> },
              { path: '/organizers/:organizerId/edit', element: <EditOrganizerPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <RouterProvider router={router} />
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}
