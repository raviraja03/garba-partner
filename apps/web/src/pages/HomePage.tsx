import { Link } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { CountBadge } from '../components/ui/Badge';
import { LinkButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon, type IconName } from '../components/ui/Icon';
import { LoadingRegion, SkeletonCard } from '../components/ui/Skeleton';
import { useAuth } from '../features/auth/auth-context';
import { useUnreadCount } from '../features/chat/hooks';
import { EventCard } from '../features/events/components/EventCard';
import { useEventList } from '../features/events/hooks';
import { CompletionCard } from '../features/profile/components/CompletionCard';
import { useMyProfile } from '../features/profile/hooks';

const STATUS_NOTICE: Partial<Record<string, string>> = {
  suspended:
    'Your account is currently suspended. You can still update your profile, but other features are unavailable.',
  pending_deletion: 'Your account is scheduled for deletion.',
};

const SHORTCUTS: { to: string; label: string; hint: string; icon: IconName }[] = [
  { to: '/discover', label: 'Discover', hint: 'People who match you', icon: 'compass' },
  { to: '/interests', label: 'Interests', hint: 'Who said yes to you', icon: 'heart' },
  { to: '/matches', label: 'Matches', hint: 'Your Garba partners', icon: 'users' },
  { to: '/chats', label: 'Chats', hint: 'Plan your night', icon: 'chat' },
];

/** Same query as the events page's default view, so the two share one cached request. */
const UPCOMING = { cityId: null, from: null, to: null, sort: 'date_asc' } as const;

/** Signed-in home: one clear next step, the member's areas, and what's on. */
export function HomePage() {
  const { state } = useAuth();
  const myProfile = useMyProfile();
  const active =
    state.status === 'authenticated' &&
    state.user.status === 'active' &&
    state.user.onboardingStatus === 'complete';
  const unreadChats = useUnreadCount(active).data ?? 0;
  const events = useEventList(UPCOMING);
  if (state.status !== 'authenticated') return null;

  const { user } = state;
  const notice = STATUS_NOTICE[user.status];
  const completion = myProfile.data?.completion;
  const profileDone = completion?.status === 'complete';
  const upcoming = events.data?.pages[0]?.items.slice(0, 3) ?? [];

  return (
    <div className="space-y-section">
      {/* Greeting and the one primary action. */}
      <section className="relative overflow-hidden rounded-card bg-primary px-5 py-8 text-white shadow-raised sm:px-8 sm:py-10">
        <span
          aria-hidden="true"
          className="absolute -top-20 -right-16 size-64 rounded-full bg-secondary/30 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-24 left-1/3 size-64 rounded-full bg-accent-orange/20 blur-3xl"
        />
        <div className="relative max-w-xl">
          <h1 className="text-h1 text-white">
            {user.displayName ? `Welcome, ${user.displayName}!` : 'Welcome!'}
          </h1>
          <p className="mt-2 text-white/85">
            {profileDone
              ? 'Find a Garba partner in your city, or pick an event and see who else is looking.'
              : 'Finish your profile so other members can find you.'}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {profileDone ? (
              <LinkButton to="/discover" variant="cta">
                <Icon name="compass" />
                Find a partner
              </LinkButton>
            ) : (
              <LinkButton
                to={myProfile.data?.profile?.image ? '/profile/edit' : '/onboarding'}
                variant="cta"
              >
                Finish your profile
              </LinkButton>
            )}
            <LinkButton to="/events" variant="secondary" size="lg">
              <Icon name="calendar" />
              Browse events
            </LinkButton>
          </div>
        </div>
      </section>

      {notice && <Alert tone="error">{notice}</Alert>}
      {completion && completion.percentage < 100 && <CompletionCard completion={completion} />}

      <nav aria-label="Your GarbaMates">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {SHORTCUTS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="group flex h-full flex-col gap-3 rounded-card bg-card p-4 shadow-card ring-1 ring-brand-900/5 transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised sm:p-5"
              >
                <span className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                    <Icon name={item.icon} className="size-5.5" />
                  </span>
                  {item.to === '/chats' && (
                    <CountBadge
                      count={unreadChats}
                      label={`${String(unreadChats)} unread messages`}
                    />
                  )}
                </span>
                <span>
                  <span className="block text-h3 text-ink">{item.label}</span>
                  <span className="block text-small text-muted">{item.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="home-events" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <h2 id="home-events">Coming up</h2>
          <LinkButton to="/events" variant="link">
            See all events
          </LinkButton>
        </div>
        {events.isPending && (
          <LoadingRegion
            label="Loading events…"
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        )}
        {events.isError && (
          <EmptyState
            tone="error"
            title="We couldn't load events"
            action={
              <LinkButton to="/events" variant="secondary">
                Open the events page
              </LinkButton>
            }
          >
            Check your connection and try again.
          </EmptyState>
        )}
        {events.isSuccess && upcoming.length === 0 && (
          <EmptyState icon="calendar" title="No upcoming events yet">
            New Garba nights are added often. Check back soon.
          </EmptyState>
        )}
        {upcoming.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
