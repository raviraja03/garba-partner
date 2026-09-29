import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { ORGANIZER_STATUSES } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FILTER_CLASS } from '../components/ui/styles';
import { useHasPermission } from '../features/auth/auth-context';
import { OrganizerStatusBadge, VerifiedMark } from '../features/events/Badges';
import { useOrganizerList } from '../features/organizers/hooks';
import type { OrganizerListFilters } from '../features/organizers/organizers-api';
import { formatDateTime } from '../lib/format';

export function OrganizersPage() {
  const canManage = useHasPermission('events:manage');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OrganizerListFilters['status']>('');
  const [verified, setVerified] = useState<OrganizerListFilters['verified']>('');
  const list = useOrganizerList({ q: useDeferredValue(q), status, verified });
  const organizers = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Organizers</h1>
        {canManage && (
          <Link
            to="/organizers/new"
            className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
          >
            New organizer
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="organizer-search">
          Search organizers
        </label>
        <input
          id="organizer-search"
          type="search"
          placeholder="Search by name"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
          className={`${FILTER_CLASS} min-w-64 flex-1`}
        />
        <label className="sr-only" htmlFor="organizer-status">
          Status
        </label>
        <select
          id="organizer-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrganizerListFilters['status']);
          }}
          className={FILTER_CLASS}
        >
          <option value="">All statuses</option>
          {ORGANIZER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="organizer-verified">
          Verification
        </label>
        <select
          id="organizer-verified"
          value={verified}
          onChange={(e) => {
            setVerified(e.target.value as OrganizerListFilters['verified']);
          }}
          className={FILTER_CLASS}
        >
          <option value="">Verified or not</option>
          <option value="true">Verified</option>
          <option value="false">Not verified</option>
        </select>
      </div>

      {list.isError && <Alert tone="error">{list.error.message}</Alert>}

      <div className="overflow-x-auto rounded-card bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 text-xs text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Organizer
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
              <th scope="col" className="px-4 py-3">
                Added
              </th>
            </tr>
          </thead>
          <tbody>
            {organizers.map((organizer) => (
              <tr
                key={organizer.id}
                className="border-b border-black/5 last:border-0 hover:bg-brand-50/50"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/organizers/${organizer.id}`}
                    className="font-semibold hover:underline"
                  >
                    {organizer.name}
                  </Link>
                </td>
                <td className="space-x-1 px-4 py-3">
                  <OrganizerStatusBadge status={organizer.status} />
                  <VerifiedMark verified={organizer.isVerified} />
                </td>
                <td className="px-4 py-3">{formatDateTime(organizer.createdAt)}</td>
              </tr>
            ))}
            {!list.isPending && organizers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">
                  No organizers found.
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
