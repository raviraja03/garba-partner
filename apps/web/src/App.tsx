import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/AppShell';
import { AuthProvider } from './features/auth/AuthProvider';
import { ChatRealtime } from './features/chat/ChatRealtime';
import { PublicOnly, RequireAuth } from './features/auth/guards';
import { RequireProfile } from './features/profile/RequireProfile';
import { ApiClientError } from './lib/api-client';
import { BlockedMembersPage } from './pages/BlockedMembersPage';
import { BookingPage, BookingsPage } from './pages/BookingPages';
import { ChatPage } from './pages/ChatPage';
import { ChatsPage } from './pages/ChatsPage';
import { CommunityGuidelinesPage } from './pages/CommunityGuidelinesPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { EditProfilePage } from './pages/EditProfilePage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventsPage } from './pages/EventsPage';
import { FindPartnerPage } from './pages/FindPartnerPage';
import { HomePage } from './pages/HomePage';
import { InterestsPage } from './pages/InterestsPage';
import { LoginPage } from './pages/LoginPage';
import { MatchesPage } from './pages/MatchesPage';
import { MatchPage } from './pages/MatchPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PartnerProfilePage } from './pages/PartnerProfilePage';
import { PreferencesPage } from './pages/PreferencesPage';
import { ProfilePage } from './pages/ProfilePage';
import { SafetyCenterPage } from './pages/SafetyCenterPage';
import { VerifyOtpPage } from './pages/VerifyOtpPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry client errors (validation, auth, not found).
      retry: (failureCount, error) =>
        !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) &&
        failureCount < 2,
    },
  },
});

const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/login/verify', element: <VerifyOtpPage /> },
    ],
  },
  {
    element: <AppShell />,
    children: [
      // Public: visitors can browse events before signing up.
      { path: '/events', element: <EventsPage /> },
      { path: '/events/:idOrSlug', element: <EventDetailPage /> },
      // Public: safety information must be reachable by everyone, signed in or not.
      { path: '/safety', element: <SafetyCenterPage /> },
      { path: '/guidelines', element: <CommunityGuidelinesPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/onboarding', element: <OnboardingPage /> },
          {
            element: <RequireProfile />,
            children: [
              { path: '/', element: <HomePage /> },
              { path: '/profile', element: <ProfilePage /> },
              { path: '/profile/edit', element: <EditProfilePage /> },
              { path: '/profile/preferences', element: <PreferencesPage /> },
              { path: '/profile/blocked', element: <BlockedMembersPage /> },
              { path: '/events/:idOrSlug/find-partner', element: <FindPartnerPage /> },
              { path: '/discover', element: <DiscoverPage /> },
              { path: '/partners/:userId', element: <PartnerProfilePage /> },
              { path: '/interests', element: <InterestsPage /> },
              { path: '/matches', element: <MatchesPage /> },
              { path: '/matches/:matchId', element: <MatchPage /> },
              { path: '/chats', element: <ChatsPage /> },
              { path: '/chats/:matchId', element: <ChatPage /> },
              { path: '/notifications', element: <NotificationsPage /> },
              { path: '/bookings', element: <BookingsPage /> },
              { path: '/bookings/:bookingId', element: <BookingPage /> },
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
      <AuthProvider>
        <ChatRealtime />
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
