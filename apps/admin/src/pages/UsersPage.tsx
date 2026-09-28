import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { USER_STATUSES, type UserStatus } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { useUserList } from '../features/users/hooks';
import { AccountStatusBadge, ProfileStatusBadge } from '../features/users/StatusBadge';

const INPUT_CLASS =
  'rounded-xl bg-white px-4 py-2.5 text-sm ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-brand-600';

function formatDate(iso: string | null) {
  return iso
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
        new Date(iso),
      )
    : '—';
}

export function UsersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const filters = { q: useDeferredValue(q), status };
  const list = useUserList(filters);
  const users = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Users</h1>

      <div className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="user-search">
          Search users
        </label>
        <input
          id="user-search"
          type="search"
          placeholder="Search by name, mobile number or user ID"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
          }}
          className={`${INPUT_CLASS} min-w-72 flex-1`}
        />
        <label className="sr-only" htmlFor="status-filter">
          Account status
        </label>
        <select
          id="status-filter"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as UserStatus | '');
          }}
          className={INPUT_CLASS}
        >
          <option value="">All statuses</option>
          {USER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted">
        Mobile numbers are matched securely and are never displayed.
      </p>

      {list.isError && <Alert tone="error">{list.error.message}</Alert>}

      <div className="overflow-x-auto rounded-card bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 text-xs text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Member
              </th>
              <th scope="col" className="px-4 py-3">
                Account
              </th>
              <th scope="col" className="px-4 py-3">
                Profile
              </th>
              <th scope="col" className="px-4 py-3">
                City
              </th>
              <th scope="col" className="px-4 py-3">
                Joined
              </th>
              <th scope="col" className="px-4 py-3">
                Last active
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-black/5 last:border-0 hover:bg-brand-50/50"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/users/${user.id}`}
                    className="flex items-center gap-3 font-semibold hover:underline"
                  >
                    {user.thumbnailUrl ? (
                      <img
                        src={user.thumbnailUrl}
                        alt=""
                        className="size-9 rounded-full object-cover"
                      />
                    ) : (
                      <span className="size-9 rounded-full bg-black/5" aria-hidden="true" />
                    )}
                    <span>
                      {user.name ?? <span className="text-muted italic">No profile</span>}
                      {user.photoVerified && (
                        <span className="ml-1 text-xs text-green-700">✓ verified</span>
                      )}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <AccountStatusBadge status={user.accountStatus} />
                </td>
                <td className="px-4 py-3">
                  <ProfileStatusBadge status={user.profileStatus} />{' '}
                  <span className="text-xs text-muted">{user.completionPercentage}%</span>
                </td>
                <td className="px-4 py-3">{user.city ?? '—'}</td>
                <td className="px-4 py-3">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3">{formatDate(user.lastActiveAt)}</td>
              </tr>
            ))}
            {!list.isPending && users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No users found.
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
