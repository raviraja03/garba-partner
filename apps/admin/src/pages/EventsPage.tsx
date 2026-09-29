import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { ADMIN_EVENT_SORTS, EVENT_STATUSES, type AdminEventSort } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FILTER_CLASS } from '../components/ui/styles';
import { useHasPermission } from '../features/auth/auth-context';
import { EventStatusBadge, VerifiedMark } from '../features/events/Badges';
import type { EventListFilters } from '../features/events/events-api';
import { useCities, useEventList } from '../features/events/hooks';
import { formatSchedule } from '../lib/format';

const SORT_LABELS: Record<AdminEventSort, string> = {
  created_desc: 'Newest first',
  date_asc: 'Event date (soonest)',
  date_desc: 'Event date (latest)',
  name_asc: 'Name (A–Z)',
};

export function EventsPage() {
  const canManage = useHasPermission('events:manage');
  const cities = useCities();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Omit<EventListFilters, 'q'>>({
    status: '',
    cityId: '',
    verified: '',
    sort: 'created_desc',
  });
  const list = useEventList({ ...filters, q: useDeferredValue(q) });
  const events = list.data?.pages.flatMap((page) => page.items) ?? [];

  function setFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Events</h1>
        {canManage && (
          <Link
            to="/events/new"
            className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
          >
            New event
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="event-search">
          Search events
        </label>
        <input
          id="event-search"
          type="search"
          placeholder="Search by name, slug or ID"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
          className={`${FILTER_CLASS} min-w-64 flex-1`}
        />
        <label className="sr-only" htmlFor="event-status">
          Status
        </label>
        <select
          id="event-status"
          value={filters.status}
          onChange={(e) => {
            setFilter('status', e.target.value as EventListFilters['status']);
          }}
          className={FILTER_CLASS}
        >
          <option value="">All statuses</option>
          {EVENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="event-city">
          City
        </label>
        <select
          id="event-city"
          value={filters.cityId}
          onChange={(e) => {
            setFilter('cityId', e.target.value);
          }}
          className={FILTER_CLASS}
        >
          <option value="">All cities</option>
          {cities.data?.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="event-verified">
          Verification
        </label>
        <select
          id="event-verified"
          value={filters.verified}
          onChange={(e) => {
            setFilter('verified', e.target.value as EventListFilters['verified']);
          }}
          className={FILTER_CLASS}
        >
          <option value="">Verified or not</option>
          <option value="true">Verified</option>
          <option value="false">Not verified</option>
        </select>
        <label className="sr-only" htmlFor="event-sort">
          Sort
        </label>
        <select
          id="event-sort"
          value={filters.sort}
          onChange={(e) => {
            setFilter('sort', e.target.value as AdminEventSort);
          }}
          className={FILTER_CLASS}
        >
          {ADMIN_EVENT_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>

      {list.isError && <Alert tone="error">{list.error.message}</Alert>}

      <div className="overflow-x-auto rounded-card bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 text-xs text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Event
              </th>
              <th scope="col" className="px-4 py-3">
                When
              </th>
              <th scope="col" className="px-4 py-3">
                City
              </th>
              <th scope="col" className="px-4 py-3">
                Organizer
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className="border-b border-black/5 last:border-0 hover:bg-brand-50/50"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/events/${event.id}`}
                    className="flex items-center gap-3 font-semibold hover:underline"
                  >
                    {event.thumbnailUrl ? (
                      <img
                        src={event.thumbnailUrl}
                        alt=""
                        className="size-9 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="size-9 rounded-lg bg-black/5" aria-hidden="true" />
                    )}
                    {event.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {formatSchedule(event.eventDate, event.startTime, event.endTime)}
                </td>
                <td className="px-4 py-3">{event.city.name}</td>
                <td className="px-4 py-3">
                  {event.organizer.name}
                  {event.organizer.isVerified && (
                    <span className="ml-1 text-xs text-green-700">✓</span>
                  )}
                </td>
                <td className="space-x-1 px-4 py-3 whitespace-nowrap">
                  <EventStatusBadge status={event.status} ended={event.hasEnded} />
                  <VerifiedMark verified={event.isVerified} />
                </td>
              </tr>
            ))}
            {!list.isPending && events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {list.hasNextPage && (
        <Button
          variant="secondary"
          className="w-auto! px-6"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
