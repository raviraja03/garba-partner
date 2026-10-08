import { Outlet, useLocation } from 'react-router';
import { useAuth } from '../features/auth/auth-context';
import { SafetyNotices } from '../features/safety/components/SafetyNotices';
import { Footer } from './Footer';
import { FullPageSpinner } from './FullPageSpinner';
import { Navbar } from './Navbar';
import { PageContainer, type PageWidth } from './PageContainer';

/**
 * Pages that are a list or grid use the wide column; everything else (forms, chats,
 * profiles, reading text) keeps the narrower one. See PageContainer.
 */
const WIDE_PAGES = new Set(['/', '/events', '/discover']);

/** An event's own page (`/events/<slug>`): content beside a sticky action column on desktop. */
const EVENT_PAGE = /^\/events\/[^/]+$/;

/**
 * A conversation is a full-screen task on phones and tablets: the tab bar and footer step aside
 * so the messages and the keyboard get the room. Its header has the way back.
 */
const FOCUSED_PAGE = /^\/chats\/[^/]+$/;

function pageWidth(pathname: string): PageWidth {
  const path = pathname.replace(/\/+$/, '') || '/';
  return WIDE_PAGES.has(path) || EVENT_PAGE.test(path) ? 'wide' : 'content';
}

/** Layout for app pages (mobile-first). Event pages are public, so visitors see it too. */
export function AppShell() {
  const { state } = useAuth();
  const { pathname } = useLocation();
  const authenticated = state.status === 'authenticated';
  const width = pageWidth(pathname);
  const focused = authenticated && FOCUSED_PAGE.test(pathname.replace(/\/+$/, ''));

  // Public pages differ for visitors and members (banner, navigation): wait for the session
  // check so the page is drawn once, instead of jumping when the answer arrives.
  if (state.status === 'loading') return <FullPageSpinner />;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-brand-600 focus:px-4 focus:py-3 focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <Navbar tabBar={!focused} />
      <PageContainer width={width}>
        <SafetyNotices enabled={authenticated} />
      </PageContainer>
      <PageContainer
        as="main"
        id="main"
        width={width}
        className="min-h-[calc(100dvh-4rem)] flex-1 py-6 sm:py-8 lg:py-10"
      >
        <Outlet />
      </PageContainer>
      {/* `main` fills the first screen, so the footer never jumps while a short page loads. */}
      {/* Signed-in members have the tab bar fixed over the bottom on mobile and tablet. */}
      <Footer
        member={authenticated}
        tabBarOffset={authenticated && !focused}
        className={focused ? 'hidden lg:block' : ''}
      />
    </div>
  );
}
