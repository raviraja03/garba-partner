import { Link } from 'react-router';
import type { AdminSanctionDto } from '@garba-partner/shared';
import { formatDateTime } from '../../lib/format';
import { REASON_LABELS } from '../reports/labels';
import { SANCTION_LABELS } from './labels';

function state(sanction: AdminSanctionDto): string {
  if (sanction.revokedAt) return `Lifted ${formatDateTime(sanction.revokedAt)}`;
  if (sanction.expiredAt) return `Ended ${formatDateTime(sanction.expiredAt)}`;
  if (sanction.type === 'warning') {
    return sanction.acknowledgedAt
      ? `Acknowledged ${formatDateTime(sanction.acknowledgedAt)}`
      : 'Not acknowledged yet';
  }
  return sanction.endsAt ? `Active until ${formatDateTime(sanction.endsAt)}` : 'Active';
}

/** A member's sanction history (newest first), with internal notes. */
export function SanctionHistory({ sanctions }: { sanctions: AdminSanctionDto[] }) {
  if (sanctions.length === 0) return <p className="text-sm text-muted">No sanctions.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {sanctions.map((sanction) => (
        <li
          key={sanction.id}
          className={`rounded-xl px-3 py-2 ${sanction.active && sanction.type !== 'warning' ? 'bg-red-50' : 'bg-black/5'}`}
        >
          <p>
            <strong>{SANCTION_LABELS[sanction.type]}</strong> · {REASON_LABELS[sanction.reasonCode]}{' '}
            · {formatDateTime(sanction.createdAt)} ·{' '}
            <span className="text-muted">{state(sanction)}</span>
          </p>
          <p className="whitespace-pre-wrap text-muted">{sanction.note}</p>
          {sanction.revokeReason && (
            <p className="text-xs text-muted">Lift reason: {sanction.revokeReason}</p>
          )}
          {sanction.reportId && (
            <Link
              to={`/reports/${sanction.reportId}`}
              className="text-xs font-semibold hover:underline"
            >
              From report
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
