import { Link, useSearchParams } from 'react-router';
import { GARBA_LEVELS, isIsoDate, todayInIndia, type GarbaLevel } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { PartnerCard } from '../features/partners/components/PartnerCard';
import { useMyEvents, usePartnerList } from '../features/partners/hooks';
import type { PartnerFilters } from '../features/partners/partners-api';
import { useCities, useMyProfile } from '../features/profile/hooks';
import { ApiClientError } from '../lib/api-client';
import { GARBA_LEVEL_LABELS } from '../lib/labels';

const CONTROL =
  'rounded-xl bg-white px-3 py-2.5 text-sm ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-brand-600';
const ALL_CITIES = 'all';

function isGarbaLevel(value: string): value is GarbaLevel {
  return (GARBA_LEVELS as readonly string[]).includes(value);
}

/**
 * Partner discovery. Filters live in the URL (`?city=…&event=…&level=beginner,advanced&date=…
 * &minAge=…&maxAge=…&verified=1`). Results are ranked by the server; no score is shown.
 */
export function DiscoverPage() {
  const [params, setParams] = useSearchParams();
  const myProfile = useMyProfile();
  const cities = useCities();
  const myEvents = useMyEvents();
  const ownCityId = myProfile.data?.profile?.city.id ?? '';

  const cityParam = params.get('city');
  const rawDate = params.get('date') ?? '';
  const filters: PartnerFilters = {
    eventId: params.get('event') ?? '',
    // Default to the member's own city; "all" searches every city (same city still ranks higher).
    cityId: cityParam === ALL_CITIES ? '' : (cityParam ?? ownCityId),
    minAge: params.get('minAge') ?? '',
    maxAge: params.get('maxAge') ?? '',
    garbaLevels: (params.get('level') ?? '').split(',').filter(isGarbaLevel),
    date: isIsoDate(rawDate) ? rawDate : '',
    verifiedOnly: params.get('verified') === '1',
  };
  // Wait for the profile so the first search already uses the member's city.
  const list = usePartnerList(filters, !myProfile.isPending);
  const partners = list.data?.pages.flatMap((page) => page.items) ?? [];
  const lookingEvents = (myEvents.data ?? []).filter((attendance) => attendance.lookingForPartner);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  }

  function toggleLevel(level: GarbaLevel) {
    const levels = filters.garbaLevels.includes(level)
      ? filters.garbaLevels.filter((l) => l !== level)
      : [...filters.garbaLevels, level];
    update({ level: levels.join(',') || null });
  }

  const error = list.error instanceof ApiClientError ? list.error : null;
  const discoveryOff = myProfile.data?.preferences?.discoveryEnabled === false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Discover partners</h1>
        <p className="mt-1 text-sm text-muted">
          Members who match your preferences, and whose preferences you match. Suggestions are
          ordered by simple signals like shared events and dates. They say nothing about whether
          someone is a good or safe match.
        </p>
      </div>

      {discoveryOff && (
        <Alert tone="info">
          You&apos;re browsing while hidden: other members can&apos;t find you.{' '}
          <Link to="/profile/preferences" className="font-semibold underline">
            Turn on discovery
          </Link>
        </Alert>
      )}

      <form
        aria-label="Filter partners"
        className="space-y-3 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="flex flex-wrap gap-3">
          <label className="sr-only" htmlFor="filter-event">
            Event
          </label>
          <select
            id="filter-event"
            value={filters.eventId}
            onChange={(e) => {
              update({ event: e.target.value || null });
            }}
            className={CONTROL}
          >
            <option value="">Any event</option>
            {lookingEvents.map((attendance) => (
              <option key={attendance.event.id} value={attendance.event.id}>
                {attendance.event.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-city">
            City
          </label>
          <select
            id="filter-city"
            value={cityParam === ALL_CITIES ? ALL_CITIES : filters.cityId}
            onChange={(e) => {
              update({ city: e.target.value === ownCityId ? null : e.target.value });
            }}
            className={CONTROL}
          >
            <option value={ALL_CITIES}>All cities</option>
            {cities.data?.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-date">
            Available on
          </label>
          <input
            id="filter-date"
            type="date"
            min={todayInIndia()}
            value={filters.date}
            onChange={(e) => {
              update({ date: e.target.value || null });
            }}
            className={CONTROL}
          />
          <label className="flex items-center gap-2 text-sm">
            Age
            <input
              type="number"
              inputMode="numeric"
              min={18}
              max={80}
              placeholder="min"
              aria-label="Minimum age"
              value={filters.minAge}
              onChange={(e) => {
                update({ minAge: e.target.value || null });
              }}
              className={`${CONTROL} w-20`}
            />
            –
            <input
              type="number"
              inputMode="numeric"
              min={18}
              max={80}
              placeholder="max"
              aria-label="Maximum age"
              value={filters.maxAge}
              onChange={(e) => {
                update({ maxAge: e.target.value || null });
              }}
              className={`${CONTROL} w-20`}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <fieldset className="flex flex-wrap gap-3">
            <legend className="sr-only">Garba level</legend>
            {GARBA_LEVELS.map((level) => (
              <label key={level} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.garbaLevels.includes(level)}
                  onChange={() => {
                    toggleLevel(level);
                  }}
                />
                {GARBA_LEVEL_LABELS[level].label}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-1.5 font-semibold">
            <input
              type="checkbox"
              checked={filters.verifiedOnly}
              onChange={(e) => {
                update({ verified: e.target.checked ? '1' : null });
              }}
            />
            Verified only
          </label>
        </div>
        <p className="text-xs text-muted">
          Age filters can narrow, but never widen, the age range in your preferences.
        </p>
      </form>

      {error?.code === 'ONBOARDING_REQUIRED' && (
        <Alert tone="info">
          Finish your profile (including a photo) to discover partners.{' '}
          <Link to="/profile/edit" className="font-semibold underline">
            Complete profile
          </Link>
        </Alert>
      )}
      {error?.code === 'PARTNER_TOGGLE_REQUIRED' && (
        <Alert tone="info">
          Turn on “I’m looking for a partner” for this event to see who else is.
        </Alert>
      )}
      {error && !['ONBOARDING_REQUIRED', 'PARTNER_TOGGLE_REQUIRED'].includes(error.code) && (
        <Alert tone="error">{error.message}</Alert>
      )}
      {list.isPending && (
        <p role="status" className="text-sm text-muted">
          Finding partners…
        </p>
      )}
      {!list.isPending && !list.isError && partners.length === 0 && (
        <section className="rounded-card bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold">No one matches yet</h2>
          <p className="mt-1 text-sm text-muted">
            Check back closer to the event, try another city, or widen your preferences.
          </p>
        </section>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {partners.map((partner) => (
          <PartnerCard key={partner.profile.id} partner={partner} />
        ))}
      </div>

      {list.hasNextPage && (
        <Button
          variant="secondary"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  );
}
