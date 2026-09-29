import type { EventStatus, OrganizerStatus } from '@garba-partner/shared';

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

const EVENT_STATUS: Record<EventStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-black/5 text-muted' },
  published: { label: 'Published', className: 'bg-green-100 text-green-800' },
  archived: { label: 'Archived', className: 'bg-red-100 text-red-800' },
};

const ORGANIZER_STATUS: Record<OrganizerStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800' },
  archived: { label: 'Archived', className: 'bg-red-100 text-red-800' },
};

export const EventStatusBadge = ({ status, ended }: { status: EventStatus; ended?: boolean }) => (
  <>
    <Badge {...EVENT_STATUS[status]} />
    {ended && status !== 'archived' && (
      <Badge label="Ended" className="ml-1 bg-black/10 text-muted" />
    )}
  </>
);

export const OrganizerStatusBadge = ({ status }: { status: OrganizerStatus }) => (
  <Badge {...ORGANIZER_STATUS[status]} />
);

export const VerifiedMark = ({ verified }: { verified: boolean }) =>
  verified ? (
    <Badge label="✓ Verified" className="bg-green-100 text-green-800" />
  ) : (
    <Badge label="Not verified" className="bg-black/5 text-muted" />
  );
