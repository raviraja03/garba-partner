import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import type { AdminOrganizerDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useHasPermission } from '../features/auth/auth-context';
import { OrganizerStatusBadge, VerifiedMark } from '../features/events/Badges';
import { OrganizerForm } from '../features/organizers/OrganizerForm';
import { organizerKeys, useOrganizer, useOrganizerAction } from '../features/organizers/hooks';
import {
  EMPTY_ORGANIZER_VALUES,
  organizerToValues,
} from '../features/organizers/organizer-form-values';
import {
  createOrganizer,
  updateOrganizer,
  type OrganizerAction,
} from '../features/organizers/organizers-api';
import { formatDateTime } from '../lib/format';

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words whitespace-pre-line">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const ACTION_LABELS: Record<OrganizerAction, string> = {
  verify: 'Mark as verified',
  unverify: 'Remove verification',
  archive: 'Archive',
  restore: 'Restore',
};

function OrganizerActions({ organizer }: { organizer: AdminOrganizerDto }) {
  const action = useOrganizerAction(organizer.id);
  const [error, setError] = useState<string | null>(null);
  const actions: OrganizerAction[] =
    organizer.status === 'archived'
      ? ['restore']
      : [organizer.isVerified ? 'unverify' : 'verify', 'archive'];

  async function run(name: OrganizerAction) {
    if (
      name === 'verify' &&
      !window.confirm('Mark as verified? Only do this after checking the organizer is genuine.')
    ) {
      return;
    }
    setError(null);
    try {
      await action.mutateAsync(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {organizer.status === 'active' && (
          <Link
            to={`/organizers/${organizer.id}/edit`}
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold ring-1 ring-black/10 hover:bg-brand-50"
          >
            Edit
          </Link>
        )}
        {actions.map((name) => (
          <Button
            key={name}
            variant="secondary"
            className="w-auto! px-4 py-2.5! text-sm"
            loading={action.isPending && action.variables === name}
            disabled={action.isPending}
            onClick={() => void run(name)}
          >
            {ACTION_LABELS[name]}
          </Button>
        ))}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

export function OrganizerDetailPage() {
  const { organizerId = '' } = useParams();
  const canManage = useHasPermission('events:manage');
  const query = useOrganizer(organizerId);

  if (query.isPending) return <FullPageSpinner />;
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;
  const organizer = query.data;

  return (
    <div className="max-w-4xl space-y-5">
      <Link to="/organizers" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All organizers
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold">{organizer.name}</h1>
        <p className="flex gap-2">
          <OrganizerStatusBadge status={organizer.status} />
          <VerifiedMark verified={organizer.isVerified} />
        </p>
      </div>
      {canManage && <OrganizerActions organizer={organizer} />}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold">Public profile</h2>
          <div className="mt-3">
            <Rows
              rows={[
                ['About', organizer.description ?? '—'],
                ['Website', organizer.websiteUrl ?? '—'],
                ['Instagram', organizer.instagramHandle ? `@${organizer.instagramHandle}` : '—'],
                [
                  'Events',
                  `${String(organizer.eventCounts.total)} total, ${String(organizer.eventCounts.upcomingPublished)} upcoming published`,
                ],
                ['Verified', formatDateTime(organizer.verifiedAt)],
                ['Added', formatDateTime(organizer.createdAt)],
                ['Updated', formatDateTime(organizer.updatedAt)],
              ]}
            />
          </div>
        </section>
        <section className="rounded-card bg-amber-50 p-5 shadow-sm ring-1 ring-amber-200">
          <h2 className="font-semibold">Private contact (admins only)</h2>
          <div className="mt-3">
            {organizer.contact ? (
              <Rows
                rows={[
                  ['Contact', organizer.contact.contactName ?? '—'],
                  ['Phone', organizer.contact.contactPhone ?? '—'],
                  ['Email', organizer.contact.contactEmail ?? '—'],
                  ['Notes', organizer.contact.notes ?? '—'],
                ]}
              />
            ) : (
              <p className="text-sm text-muted">
                Contact details are visible only to admins who manage events.
              </p>
            )}
          </div>
        </section>
      </div>
      <Link
        to="/events"
        className="inline-block text-sm font-semibold text-brand-700 hover:underline"
      >
        Manage events →
      </Link>
    </div>
  );
}

export function NewOrganizerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <div className="space-y-5">
      <Link to="/organizers" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All organizers
      </Link>
      <h1 className="text-2xl font-extrabold">New organizer</h1>
      <OrganizerForm
        initial={EMPTY_ORGANIZER_VALUES}
        submitLabel="Create organizer"
        onSubmit={async (input) => {
          const organizer = await createOrganizer(input);
          await queryClient.invalidateQueries({ queryKey: organizerKeys.all });
          await navigate(`/organizers/${organizer.id}`);
        }}
      />
    </div>
  );
}

export function EditOrganizerPage() {
  const { organizerId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useOrganizer(organizerId);

  if (query.isPending) return <FullPageSpinner />;
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;

  return (
    <div className="space-y-5">
      <Link
        to={`/organizers/${organizerId}`}
        className="text-sm font-semibold text-brand-700 hover:underline"
      >
        ← {query.data.name}
      </Link>
      <h1 className="text-2xl font-extrabold">Edit organizer</h1>
      <OrganizerForm
        initial={organizerToValues(query.data)}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          const updated = await updateOrganizer(organizerId, input);
          queryClient.setQueryData(organizerKeys.detail(organizerId), updated);
          await queryClient.invalidateQueries({ queryKey: organizerKeys.all });
          await navigate(`/organizers/${organizerId}`);
        }}
      />
    </div>
  );
}
