import { useSearchParams } from 'react-router';
import { EVENT_SORTS, isIsoDate, todayInIndia, type EventSort } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { EventCard } from '../features/events/components/EventCard';
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  presetRange,
  type DatePreset,
} from '../features/events/event-dates';
import { useEventList } from '../features/events/hooks';
import { useCities } from '../features/profile/hooks';

const SELECT_CLASS =
  'rounded-xl bg-white px-3 py-2.5 text-sm ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-brand-600';

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Garba events</h1>
        <p className="mt-1 text-muted">
          Find a Navratri night near you, then find a partner for it.
        </p>
      </div>

      <form
        aria-label="Filter events"
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label className="sr-only" htmlFor="filter-city">
          City
        </label>
        <select
          id="filter-city"
          value={cityId ?? ''}
          onChange={(event) => {
            update({ city: event.target.value || null });
          }}
          className={SELECT_CLASS}
        >
          <option value="">All cities</option>
          {cities.data?.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-when">
          Date
        </label>
        <select
          id="filter-when"
          value={when}
          onChange={(event) => {
            const preset = readPreset(event.target.value);
            update({
              when: preset === 'upcoming' ? null : preset,
              date: preset === 'date' ? (pickedDate ?? todayInIndia()) : null,
            });
          }}
          className={SELECT_CLASS}
        >
          {DATE_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {DATE_PRESET_LABELS[preset]}
            </option>
          ))}
        </select>

        {when === 'date' && (
          <>
            <label className="sr-only" htmlFor="filter-date">
              Event date
            </label>
            <input
              id="filter-date"
              type="date"
              min={todayInIndia()}
              value={pickedDate ?? ''}
              onChange={(event) => {
                update({ date: event.target.value || null });
              }}
              className={SELECT_CLASS}
            />
          </>
        )}

        <label className="sr-only" htmlFor="filter-sort">
          Sort
        </label>
        <select
          id="filter-sort"
          value={sort}
          onChange={(event) => {
            const next = readSort(event.target.value);
            update({ sort: next === 'date_asc' ? null : next });
          }}
          className={SELECT_CLASS}
        >
          {EVENT_SORTS.map((option) => (
            <option key={option} value={option}>
              {SORT_LABELS[option]}
            </option>
          ))}
        </select>
      </form>

      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {list.isPending && (
        <p role="status" className="text-sm text-muted">
          Loading events…
        </p>
      )}
      {!list.isPending && !list.isError && events.length === 0 && (
        <section className="rounded-card bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold">No events found</h2>
          <p className="mt-1 text-sm text-muted">
            Try another city or date. New events are added throughout the season.
          </p>
        </section>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {list.hasNextPage && (
        <Button
          variant="secondary"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Show more events
        </Button>
      )}
    </div>
  );
}
