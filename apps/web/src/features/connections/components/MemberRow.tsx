import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { PublicProfileDto, SharedEventDto } from '@garba-partner/shared';
import { GARBA_LEVEL_LABELS } from '../../../lib/labels';

/** A compact member row for Interests and Matches (public allow-list profile only). */
export function MemberRow({
  member,
  to,
  event,
  note,
  children,
}: {
  member: PublicProfileDto;
  to: string;
  event?: SharedEventDto | null;
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
      <Link to={to} className="flex min-w-0 flex-1 items-center gap-3">
        {member.image ? (
          <img
            src={member.image.thumbnailUrl}
            alt=""
            className="size-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="size-14 shrink-0 rounded-full bg-brand-50" aria-hidden="true" />
        )}
        <span className="min-w-0">
          <span className="block font-semibold">
            {member.name}, {member.age}
            {(member.photoVerified || member.identityVerified) && (
              <span className="ml-1 text-sm text-green-700" title="Verified">
                ✓
              </span>
            )}
          </span>
          <span className="block text-sm text-muted">
            {GARBA_LEVEL_LABELS[member.garbaLevel].label} · {member.city.name}
          </span>
          {event && <span className="block text-xs text-muted">For {event.name}</span>}
          {note && <span className="block text-xs text-muted">{note}</span>}
        </span>
      </Link>
      {children && <div className="flex gap-2">{children}</div>}
    </li>
  );
}
