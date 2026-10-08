import { useSearchParams } from 'react-router';
import {
  APP_TAGLINE,
  EVENT_SORTS,
  isIsoDate,
  todayInIndia,
  type EventSort,
} from '@garba-partner/shared';
import { PageHeader } from '../components/PageHeader';
import { Button, LinkButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Field } from '../components/ui/Field';
import { Input, Select } from '../components/ui/Input';
import { LoadingRegion, SkeletonCard } from '../components/ui/Skeleton';
import { useAuth } from '../features/auth/auth-context';
import { EventCard } from '../features/events/components/EventCard';
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  presetRange,
  type DatePreset,
} from '../features/events/event-dates';
import { useEventList } from '../features/events/hooks';
import { useCities } from '../features/profile/hooks';

const SORT_LABELS: Record<EventSort, string> = {
  date_asc: 'Soonest first',
  date_desc: 'Latest first',
};

function readPreset(value: string | null): DatePreset {
  return DATE_PRESETS.find((preset) => preset === value) ?? 'upcoming';
}

function readSort(value: string | null): EventSort {
  return EVENT_SORTS.find((sort) => sort === value) ?? 'date_asc';
}

/**
 * Public events list (no login needed). Filters live in the URL so a filtered view can be shared:
 * `?city=<id>&when=weekend&sort=date_asc` or `?when=date&date=2026-10-12`.
 */
export function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cities = useCities();
  const { state } = useAuth();
  const visitor = state.status === 'anonymous';

  const cityId = searchParams.get('city');
  const when = readPreset(searchParams.get('when'));
  const rawDate = searchParams.get('date');
  const pickedDate = rawDate && isIsoDate(rawDate) ? rawDate : null;
  const sort = readSort(searchParams.get('sort'));
  const range = presetRange(when, pickedDate);

  const list = useEventList({ cityId, from: range.from, to: range.to, sort });
  const events = list.data?.pages.flatMap((page) => page.items) ?? [];

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  const filtersActive = cityId !== null || when !== 'upcoming' || sort !== 'date_asc';
  const clearFilters = () => {
    update({ city: null, when: null, date: null, sort: null });
  };

  return (
    <div className="space-y-6">
      {visitor ? (
        // Visitors land here first: say what GarbaMates is, once, with one way in.
        <section className="relative overflow-hidden rounded-card bg-primary px-5 py-8 text-white shadow-raised sm:px-10 sm:py-12">
          <span
            aria-hidden="true"
            className="absolute -top-20 -right-16 size-72 rounded-full bg-secondary/30 blur-3xl"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-28 left-1/4 size-72 rounded-full bg-accent-orange/20 blur-3xl"
          />
          <div className="relative max-w-2xl">
            <p className="text-label tracking-widest text-accent-yellow uppercase">{APP_TAGLINE}</p>
            <h1 className="mt-2 text-display text-white">Garba events near you</h1>
            <p className="mt-3 text-white/85">
              Find a Navratri night, then find a partner or friends to dance with.
            </p>
            <div className="mt-6">
              <LinkButton to="/login" variant="cta" state={{ from: '/events' }}>
                Join GarbaMates
              </LinkButton>
            </div>
          </div>
        </section>
      ) : (
        <PageHeader
          title="Garba events"
          description="Find a Navratri night near you, then find a partner for it."
        />
      )}

      <form
        aria-label="Filter events"
        className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="col-span-2 sm:w-52">
          <Field id="filter-city" label="City">
            <Select
              id="filter-city"
              value={cityId ?? ''}
              onChange={(event) => {
                update({ city: event.target.value || null });
              }}
            >
              <option value="">All cities</option>
              {cities.data?.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="sm:w-44">
          <Field id="filter-when" label="When">
            <Select
              id="filter-when"
              value={when}
              onChange={(event) => {
                const preset = readPreset(event.target.value);
                update({
                  when: preset === 'upcoming' ? null : preset,
                  date: preset === 'date' ? (pickedDate ?? todayInIndia()) : null,
                });
              }}
            >
              {DATE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {DATE_PRESET_LABELS[preset]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="sm:w-44">
          <Field id="filter-sort" label="Sort">
            <Select
              id="filter-sort"
              value={sort}
              onChange={(event) => {
                const next = readSort(event.target.value);
                update({ sort: next === 'date_asc' ? null : next });
              }}
            >
              {EVENT_SORTS.map((option) => (
                <option key={option} value={option}>
                  {SORT_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {when === 'date' && (
          <div className="col-span-2 sm:w-48">
            <Field id="filter-date" label="Event date">
              <Input
                id="filter-date"
                type="date"
                min={todayInIndia()}
                value={pickedDate ?? ''}
                onChange={(event) => {
                  update({ date: event.target.value || null });
                }}
              />
            </Field>
          </div>
        )}

        {filtersActive && (
          <Button
            variant="link"
            className="col-span-2 justify-self-start sm:mb-0.5"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        )}
      </form>

      {list.isError && (
        <EmptyState
          tone="error"
          title="We couldn't load events"
          action={
            <Button variant="secondary" fullWidth={false} onClick={() => void list.refetch()}>
              Try again
            </Button>
          }
        >
          {list.error.message}
        </EmptyState>
      )}
      {list.isPending && (
        <LoadingRegion label="Loading events…" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </LoadingRegion>
      )}
      {list.isSuccess && events.length === 0 && (
        <EmptyState
          icon="calendar"
          title="No events found"
          action={
            filtersActive ? (
              <Button variant="secondary" fullWidth={false} onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        >
          Try another city or date. New events are added throughout the season.
        </EmptyState>
      )}

      {events.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {list.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            fullWidth={false}
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Show more events
          </Button>
        </div>
      )}
    </div>
  );
}
