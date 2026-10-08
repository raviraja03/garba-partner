import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { PublicProfileDto, SharedEventDto } from '@garba-partner/shared';
import { Avatar } from '../../../components/ui/Avatar';
import { Card } from '../../../components/ui/Card';
import { Icon } from '../../../components/ui/Icon';
import { GARBA_LEVEL_LABELS } from '../../../lib/labels';

/**
 * A compact member row for Interests and Matches (public allow-list profile only). The member
 * (photo, name, details) is one link; `children` are the row's actions, which sit beside it on
 * wider screens and below it, full width, on phones.
 */
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
  const verified = member.photoVerified || member.identityVerified;
  return (
    <Card as="li" padding="sm" className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Link to={to} className="group flex min-w-0 flex-1 items-center gap-3 rounded-control">
        <Avatar name={member.name} src={member.image?.thumbnailUrl} size="lg" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-semibold text-ink">
            <span className="truncate underline-offset-4 group-hover:underline">
              {member.name}, {member.age}
            </span>
            {verified && (
              <Icon
                name="check"
                label="Verified"
                className="size-4.5 rounded-full bg-success-soft p-0.5 text-success"
              />
            )}
          </span>
          <span className="block text-small text-muted">
            {GARBA_LEVEL_LABELS[member.garbaLevel].label} · {member.city.name}
          </span>
          {event && (
            <span className="mt-0.5 flex items-center gap-1 text-caption text-muted">
              <Icon name="calendar" className="size-3.5" />
              For {event.name}
            </span>
          )}
          {note && <span className="block text-caption text-muted">{note}</span>}
        </span>
      </Link>
      {children && (
        <div className="grid shrink-0 auto-cols-fr grid-flow-col gap-2 sm:flex">{children}</div>
      )}
    </Card>
  );
}
