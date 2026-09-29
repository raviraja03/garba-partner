import { useState } from 'react';
import { Link } from 'react-router';
import { REPORT_REASONS, REPORT_STATUSES } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FILTER_CLASS } from '../components/ui/styles';
import { TRIGGER_LABELS } from '../features/moderation/labels';
import { useReportList } from '../features/reports/hooks';
import { PRIORITY_LABELS, REASON_LABELS, STATUS_LABELS } from '../features/reports/labels';
import type { ReportFilters } from '../features/reports/reports-api';
import { formatDateTime } from '../lib/format';

const PRIORITY_CLASS = [
  'bg-red-600 text-white',
  'bg-amber-100 text-amber-900',
  'bg-black/5 text-muted',
] as const;

/**
 * Moderation queue: open and in-review reports (member reports and automated flags), most urgent
 * first, then oldest.
 */
export function ReportsPage() {
  const [filters, setFilters] = useState<ReportFilters>({
    status: '',
    priority: '',
    reason: '',
    source: '',
  });
  const list = useReportList(filters);
  const reports = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Reports</h1>
      <div className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="report-status">
          Status
        </label>
        <select
          id="report-status"
          value={filters.status}
          onChange={(e) => {
            setFilters((f) => ({ ...f, status: e.target.value as ReportFilters['status'] }));
          }}
          className={FILTER_CLASS}
        >
          <option value="">Open &amp; in review</option>
          {REPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="report-priority">
          Priority
        </label>
        <select
          id="report-priority"
          value={filters.priority}
          onChange={(e) => {
            setFilters((f) => ({ ...f, priority: e.target.value as ReportFilters['priority'] }));
          }}
          className={FILTER_CLASS}
        >
          <option value="">All priorities</option>
          {PRIORITY_LABELS.map((label, i) => (
            <option key={label} value={String(i)}>
              {label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="report-reason">
          Reason
        </label>
        <select
          id="report-reason"
          value={filters.reason}
          onChange={(e) => {
            setFilters((f) => ({ ...f, reason: e.target.value as ReportFilters['reason'] }));
          }}
          className={FILTER_CLASS}
        >
          <option value="">All reasons</option>
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABELS[r]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="report-source">
          Source
        </label>
        <select
          id="report-source"
          value={filters.source}
          onChange={(e) => {
            setFilters((f) => ({ ...f, source: e.target.value as ReportFilters['source'] }));
          }}
          className={FILTER_CLASS}
        >
          <option value="">Members &amp; automated flags</option>
          <option value="member">Member reports</option>
          <option value="system">Automated flags</option>
        </select>
      </div>

      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      <div className="overflow-x-auto rounded-card bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 text-xs text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Priority
              </th>
              <th scope="col" className="px-4 py-3">
                Reason
              </th>
              <th scope="col" className="px-4 py-3">
                Reported member
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
              <th scope="col" className="px-4 py-3">
                Received
              </th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr
                key={report.id}
                className="border-b border-black/5 last:border-0 hover:bg-brand-50/50"
              >
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${PRIORITY_CLASS[report.priority]}`}
                  >
                    {PRIORITY_LABELS[report.priority]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/reports/${report.id}`} className="font-semibold hover:underline">
                    {REASON_LABELS[report.reason]}
                  </Link>
                  {report.involvesChat && <span className="ml-2 text-xs text-muted">chat</span>}
                  {report.trigger && (
                    <span className="mt-0.5 block text-xs font-semibold text-amber-800">
                      {TRIGGER_LABELS[report.trigger]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {report.reportedUser.name ?? 'No profile'}
                  {report.openReportsAgainstUser > 1 && (
                    <span className="ml-2 text-xs font-semibold text-red-700">
                      {report.openReportsAgainstUser} open reports
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{STATUS_LABELS[report.status]}</td>
                <td className="px-4 py-3">{formatDateTime(report.createdAt)}</td>
              </tr>
            ))}
            {!list.isPending && reports.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No reports. 🎉
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
