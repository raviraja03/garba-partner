import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { SAFETY_EVENT_TYPES, SAFETY_SEVERITIES } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FILTER_CLASS } from '../components/ui/styles';
import { useAuditLogs, useSafetyLogs } from '../features/log-viewer/hooks';
import type { AuditLogFilters, SafetyLogFilters } from '../features/log-viewer/logs-api';
import { formatDateTime } from '../lib/format';

const SEVERITY_CLASS = {
  info: 'bg-black/5 text-muted',
  warning: 'bg-amber-100 text-amber-900',
  critical: 'bg-red-600 text-white',
} as const;

function Metadata({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value);
  if (entries.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="font-mono text-xs break-all">
      {entries
        .map(([key, v]) => `${key}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' · ')}
    </span>
  );
}

function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty: boolean }) {
  return (
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
          {children}
          {empty && (
            <tr>
              <td colSpan={head.length} className="px-4 py-8 text-center text-muted">
                Nothing logged.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Suspicious-activity and safety events (`safety_logs:view`). Append-only. */
export function SafetyLogsPage() {
  const [filters, setFilters] = useState<SafetyLogFilters>({
    eventType: '',
    severity: '',
    userId: '',
  });
  const logs = useSafetyLogs(filters);
  const rows = logs.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Safety logs</h1>
      <div className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="log-event">
          Event
        </label>
        <select
          id="log-event"
          value={filters.eventType}
          onChange={(e) => {
            setFilters((f) => ({
              ...f,
              eventType: e.target.value as SafetyLogFilters['eventType'],
            }));
          }}
          className={FILTER_CLASS}
        >
          <option value="">All events</option>
          {SAFETY_EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="log-severity">
          Severity
        </label>
        <select
          id="log-severity"
          value={filters.severity}
          onChange={(e) => {
            setFilters((f) => ({ ...f, severity: e.target.value as SafetyLogFilters['severity'] }));
          }}
          className={FILTER_CLASS}
        >
          <option value="">All severities</option>
          {SAFETY_SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="log-user">
          Member ID
        </label>
        <input
          id="log-user"
          placeholder="Member ID"
          value={filters.userId}
          onChange={(e) => {
            setFilters((f) => ({ ...f, userId: e.target.value }));
          }}
          className={`${FILTER_CLASS} w-80`}
        />
      </div>
      {logs.isError && <Alert tone="error">{logs.error.message}</Alert>}
      <Table
        head={['When', 'Event', 'Severity', 'Member', 'Details']}
        empty={!logs.isPending && rows.length === 0}
      >
        {rows.map((log) => (
          <tr key={log.id} className="border-b border-black/5 align-top last:border-0">
            <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
            <td className="px-4 py-3 font-mono text-xs">{log.eventType}</td>
            <td className="px-4 py-3">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${SEVERITY_CLASS[log.severity]}`}
              >
                {log.severity}
              </span>
            </td>
            <td className="px-4 py-3">
              {log.userId ? (
                <Link to={`/users/${log.userId}`} className="font-mono text-xs hover:underline">
                  {log.userId.slice(0, 8)}…
                </Link>
              ) : (
                '—'
              )}
            </td>
            <td className="px-4 py-3">
              <Metadata value={log.metadata} />
            </td>
          </tr>
        ))}
      </Table>
      {logs.hasNextPage && (
        <Button
          variant="secondary"
          className="w-auto! px-6"
          loading={logs.isFetchingNextPage}
          onClick={() => void logs.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}

/** Every sensitive admin action (`audit:view`, super admins). Append-only. */
export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({ action: '', targetId: '' });
  const logs = useAuditLogs(filters);
  const rows = logs.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Audit log</h1>
      <div className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="audit-action">
          Action
        </label>
        <input
          id="audit-action"
          placeholder="Action, e.g. user.ban"
          value={filters.action}
          onChange={(e) => {
            setFilters((f) => ({ ...f, action: e.target.value }));
          }}
          className={FILTER_CLASS}
        />
        <label className="sr-only" htmlFor="audit-target">
          Target ID
        </label>
        <input
          id="audit-target"
          placeholder="Target ID (member, report…)"
          value={filters.targetId}
          onChange={(e) => {
            setFilters((f) => ({ ...f, targetId: e.target.value }));
          }}
          className={`${FILTER_CLASS} w-80`}
        />
      </div>
      {logs.isError && <Alert tone="error">{logs.error.message}</Alert>}
      <Table
        head={['When', 'Admin', 'Action', 'Target', 'Details']}
        empty={!logs.isPending && rows.length === 0}
      >
        {rows.map((log) => (
          <tr key={log.id} className="border-b border-black/5 align-top last:border-0">
            <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
            <td className="px-4 py-3">{log.admin.name ?? log.admin.id.slice(0, 8)}</td>
            <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
            <td className="px-4 py-3 text-xs">
              {log.targetType}
              {log.targetId && (
                <>
                  {' '}
                  {log.targetType === 'user' ? (
                    <Link to={`/users/${log.targetId}`} className="font-mono hover:underline">
                      {log.targetId.slice(0, 8)}…
                    </Link>
                  ) : log.targetType === 'report' ? (
                    <Link to={`/reports/${log.targetId}`} className="font-mono hover:underline">
                      {log.targetId.slice(0, 8)}…
                    </Link>
                  ) : (
                    <span className="font-mono">{log.targetId.slice(0, 8)}…</span>
                  )}
                </>
              )}
            </td>
            <td className="px-4 py-3">
              <Metadata value={log.metadata} />
            </td>
          </tr>
        ))}
      </Table>
      {logs.hasNextPage && (
        <Button
          variant="secondary"
          className="w-auto! px-6"
          loading={logs.isFetchingNextPage}
          onClick={() => void logs.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
