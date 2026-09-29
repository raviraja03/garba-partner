import { useQuery } from '@tanstack/react-query';
import type { AdminNotificationStatsDto, NotificationType } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { api } from '../lib/api-client';
import { formatDateTime } from '../lib/format';

const TYPE_LABELS: Record<NotificationType, string> = {
  interest_received: 'Interest received',
  interest_accepted: 'Interest accepted',
  match_created: 'Match created',
  new_message: 'New message (collapsed per chat)',
  verification_completed: 'Verification completed',
  event_reminder: 'Event reminder',
  safety: 'Safety notice (always on)',
  booking: 'Pass booking (always on)',
};

const percent = (value: number | null) =>
  value === null ? '—' : `${String(Math.round(value * 100))}%`;

/**
 * Notification monitoring: aggregate volumes, read rates, backlog and opt-outs per type
 * (docs/notifications/notifications.md#7-admin-monitoring). No member data is shown.
 */
export function NotificationsMonitorPage() {
  const stats = useQuery({
    queryKey: ['admin', 'notifications', 'stats'],
    queryFn: () =>
      api<AdminNotificationStatsDto>('/admin/notifications/stats', { authenticated: true }),
    refetchInterval: 60_000,
  });

  if (stats.isPending) return <FullPageSpinner />;
  if (stats.isError) return <Alert tone="error">{stats.error.message}</Alert>;
  const { totals, byType, generatedAt } = stats.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Notifications</h1>
        <p className="text-sm text-muted">
          Updated {formatDateTime(generatedAt)} · refreshes every minute
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ['Last 24 hours', totals.last24h],
            ['Last 7 days', totals.last7d],
            ['Unread now', totals.unread],
            ['Stored (90-day retention)', totals.stored],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
            <dt className="text-xs text-muted uppercase">{label}</dt>
            <dd className="text-2xl font-extrabold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="overflow-x-auto rounded-card bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 text-xs text-muted uppercase">
            <tr>
              {['Type', '24 h', '7 days', 'Read (7 days)', 'Unread', 'Opted out'].map((label) => (
                <th key={label} scope="col" className="px-4 py-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byType.map((row) => (
              <tr key={row.type} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3 font-semibold">{TYPE_LABELS[row.type]}</td>
                <td className="px-4 py-3">{row.last24h}</td>
                <td className="px-4 py-3">{row.last7d}</td>
                <td className="px-4 py-3">{percent(row.readRate7d)}</td>
                <td className="px-4 py-3">{row.unread}</td>
                <td className="px-4 py-3">{row.optedOut ?? 'n/a'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Aggregates only. Individual notifications, message text and member details are never shown
        here. Delivery failures are logged by the API (&quot;Notification failed&quot;).
      </p>
    </div>
  );
}
