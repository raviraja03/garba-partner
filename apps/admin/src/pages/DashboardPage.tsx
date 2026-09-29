import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { addDays, todayInIndia, type AdminDashboardSummaryDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FILTER_CLASS } from '../components/ui/styles';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useAdminAuth, useHasPermission } from '../features/auth/auth-context';
import { BarChart } from '../features/dashboard/BarChart';
import {
  downloadEventSalesCsv,
  fetchDashboardEvents,
  fetchDashboardSummary,
  fetchDashboardTrends,
  type DashboardFilters,
} from '../features/dashboard/dashboard-api';
import { useCities } from '../features/events/hooks';
import { formatPaise } from '../features/payments/format';

const PRESETS = [7, 30, 90] as const;
const number = new Intl.NumberFormat('en-IN');

function Card({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  to?: string;
}) {
  const body = (
    <>
      <dt className="text-xs font-semibold text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold">{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </>
  );
  return (
    <div className="rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
      {to ? (
        <Link to={to} className="block hover:underline">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold tracking-wide text-muted uppercase">{title}</h2>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</dl>
    </section>
  );
}

function Metrics({ s }: { s: AdminDashboardSummaryDto }) {
  const n = (value: number) => number.format(value);
  return (
    <div className="space-y-6">
      {s.users && (
        <Section title="Members">
          <Card
            label="Total members"
            value={n(s.users.total)}
            hint={`${n(s.users.newInPeriod)} joined in period`}
          />
          <Card
            label="Active (7 days)"
            value={n(s.users.active7d)}
            hint={`${n(s.users.active30d)} in 30 days`}
          />
          <Card
            label="Verified"
            value={n(s.users.verified)}
            hint="Photo or identity check (not a safety guarantee)"
          />
          <Card
            label="Suspended"
            value={n(s.users.suspended)}
            hint={`${n(s.users.banned)} banned`}
            to="/users"
          />
        </Section>
      )}
      {(s.matches ?? s.reports ?? s.events) && (
        <Section title="Activity">
          {s.events && (
            <Card
              label="Events in period"
              value={n(s.events.inPeriod)}
              hint={`${n(s.events.upcoming)} upcoming · ${n(s.events.published)} published`}
              to="/events"
            />
          )}
          {s.matches && (
            <Card
              label="Matches in period"
              value={n(s.matches.createdInPeriod)}
              hint={`${n(s.matches.active)} active now`}
            />
          )}
          {s.reports && (
            <Card
              label="Pending reports"
              value={n(s.reports.pending)}
              hint={`${n(s.reports.pendingUrgent)} urgent (P0) · ${n(s.reports.openedInPeriod)} opened in period`}
              to="/reports"
            />
          )}
        </Section>
      )}
      {s.bookings && s.revenue && (
        <Section title="Passes">
          <Card
            label="Bookings in period"
            value={n(s.bookings.confirmedInPeriod)}
            hint={`${n(s.bookings.passesSoldInPeriod)} passes · ${n(s.bookings.cancelledInPeriod)} cancelled`}
            to="/payments"
          />
          <Card
            label="Gross revenue"
            value={formatPaise(s.revenue.grossPaise)}
            hint="Captured in period"
          />
          <Card
            label="Refunds"
            value={formatPaise(s.revenue.refundedPaise)}
            hint="Refunded in period"
          />
          <Card label="Net revenue" value={formatPaise(s.revenue.netPaise)} />
        </Section>
      )}
    </div>
  );
}

function EventsTable({ filters, withSales }: { filters: DashboardFilters; withSales: boolean }) {
  const list = useInfiniteQuery({
    queryKey: ['admin', 'dashboard', 'events', filters],
    queryFn: ({ pageParam }) => fetchDashboardEvents(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  const head = ['Event', 'Date', 'City', 'Going', 'Looking for partner', 'Matches'];
  if (withSales) head.push('Passes sold', 'Net revenue');
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Events in period</h2>
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      <div className="overflow-x-auto rounded-card bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 text-xs text-muted uppercase">
            <tr>
              {head.map((label) => (
                <th key={label} scope="col" className="px-4 py-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/events/${row.id}`} className="font-semibold hover:underline">
                    {row.name}
                  </Link>
                  {row.status === 'archived' && (
                    <span className="ml-2 text-xs text-muted">archived</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{row.eventDate}</td>
                <td className="px-4 py-3">{row.city}</td>
                <td className="px-4 py-3">{row.going}</td>
                <td className="px-4 py-3">{row.lookingForPartner}</td>
                <td className="px-4 py-3">{row.matches}</td>
                {withSales && (
                  <>
                    <td className="px-4 py-3">
                      {row.sales?.pricePaise === null
                        ? '—'
                        : `${String(row.sales?.passesSold ?? 0)}${row.sales?.capacity ? ` / ${String(row.sales.capacity)}` : ''}`}
                    </td>
                    <td className="px-4 py-3">
                      {formatPaise((row.sales?.grossPaise ?? 0) - (row.sales?.refundedPaise ?? 0))}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!list.isPending && rows.length === 0 && (
              <tr>
                <td colSpan={head.length} className="px-4 py-6 text-center text-muted">
                  No events in this period.
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
    </section>
  );
}

/**
 * Operational dashboard (docs/admin/dashboard.md): aggregate counts for the selected period and
 * city. Sections, charts and the export depend on the admin's permissions; the API enforces them.
 */
export function DashboardPage() {
  const { state } = useAdminAuth();
  const canSeeEvents = useHasPermission('events:view');
  const canSeePayments = useHasPermission('payments:view');
  const cities = useCities();
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const to = todayInIndia();
    return { from: addDays(to, -29), to, cityId: '' };
  });
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const summary = useQuery({
    queryKey: ['admin', 'dashboard', 'summary', filters],
    queryFn: () => fetchDashboardSummary(filters),
    refetchInterval: 60_000,
  });
  const trends = useQuery({
    queryKey: ['admin', 'dashboard', 'trends', filters],
    queryFn: () => fetchDashboardTrends(filters),
  });

  if (state.status !== 'authenticated') return null;
  const setPreset = (days: number) => {
    const to = todayInIndia();
    setFilters((f) => ({ ...f, from: addDays(to, -(days - 1)), to }));
  };
  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadEventSalesCsv(filters);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }
  const t = trends.data;
  const chartLabel = t?.interval === 'week' ? 'per week' : 'per day';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="text-sm text-muted">
            Aggregate figures only. “In period” uses the dates below (IST); other figures are
            current.
          </p>
        </div>
        {canSeeEvents && canSeePayments && (
          <Button
            variant="secondary"
            className="w-auto! px-4 py-2!"
            loading={exporting}
            onClick={() => void handleExport()}
          >
            Export event sales (CSV)
          </Button>
        )}
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label className="space-y-1 text-xs font-semibold">
          <span className="block">From</span>
          <input
            type="date"
            value={filters.from}
            max={filters.to}
            onChange={(e) => {
              if (e.target.value) setFilters((f) => ({ ...f, from: e.target.value }));
            }}
            className={FILTER_CLASS}
          />
        </label>
        <label className="space-y-1 text-xs font-semibold">
          <span className="block">To</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={(e) => {
              if (e.target.value) setFilters((f) => ({ ...f, to: e.target.value }));
            }}
            className={FILTER_CLASS}
          />
        </label>
        <label className="space-y-1 text-xs font-semibold">
          <span className="block">City</span>
          <select
            value={filters.cityId}
            onChange={(e) => {
              setFilters((f) => ({ ...f, cityId: e.target.value }));
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
        </label>
        <div className="flex gap-2">
          {PRESETS.map((days) => (
            <Button
              key={days}
              variant="link"
              onClick={() => {
                setPreset(days);
              }}
            >
              Last {days} days
            </Button>
          ))}
        </div>
      </form>

      {exportError && <Alert tone="error">{exportError}</Alert>}
      {summary.isPending && <FullPageSpinner />}
      {summary.isError && <Alert tone="error">{summary.error.message}</Alert>}
      {summary.data && <Metrics s={summary.data} />}

      {t && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-wide text-muted uppercase">
            Trends ({chartLabel})
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {t.series.signups && (
              <BarChart title="New members" labels={t.labels} values={t.series.signups} />
            )}
            {t.series.matches && (
              <BarChart
                title="New matches"
                labels={t.labels}
                values={t.series.matches}
                color="#7c3aed"
              />
            )}
            {t.series.reports && (
              <BarChart
                title="Reports opened (moderation load)"
                labels={t.labels}
                values={t.series.reports}
                color="#dc2626"
              />
            )}
            {t.series.bookings && (
              <BarChart
                title="Pass bookings"
                labels={t.labels}
                values={t.series.bookings}
                color="#0f766e"
              />
            )}
            {t.series.revenuePaise && (
              <BarChart
                title="Gross revenue"
                labels={t.labels}
                values={t.series.revenuePaise}
                format={formatPaise}
                color="#15803d"
              />
            )}
          </div>
        </section>
      )}

      {canSeeEvents && <EventsTable filters={filters} withSales={canSeePayments} />}
    </div>
  );
}
