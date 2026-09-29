import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { AdminEventDetailDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useHasPermission } from '../features/auth/auth-context';
import { EventStatusBadge, VerifiedMark } from '../features/events/Badges';
import type { EventAction } from '../features/events/events-api';
import { PassSettings } from '../features/payments/PassSettings';
import {
  useDeleteEvent,
  useEvent,
  useEventAction,
  useEventImageDelete,
  useEventImageUpload,
} from '../features/events/hooks';
import { formatDateTime, formatSchedule } from '../lib/format';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const ACTION_LABELS: Record<EventAction, string> = {
  publish: 'Publish',
  unpublish: 'Unpublish',
  verify: 'Mark as verified',
  unverify: 'Remove verification',
  archive: 'Archive',
  restore: 'Restore as draft',
};

const CONFIRM: Partial<Record<EventAction, string>> = {
  unpublish: 'Unpublish this event? Members will no longer see it.',
  archive: 'Archive this event? It will be hidden everywhere. You can restore it later as a draft.',
  verify:
    'Mark as verified? Only do this after confirming the date, venue and pass link with the organizer.',
};

function availableActions(event: AdminEventDetailDto): EventAction[] {
  if (event.status === 'archived') return ['restore'];
  const actions: EventAction[] = [];
  if (event.status === 'draft' && !event.hasEnded) actions.push('publish');
  if (event.status === 'published') actions.push('unpublish');
  actions.push(event.isVerified ? 'unverify' : 'verify', 'archive');
  return actions;
}

function Actions({ event }: { event: AdminEventDetailDto }) {
  const action = useEventAction(event.id);
  const remove = useDeleteEvent(event.id);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function run(name: EventAction) {
    const question = CONFIRM[name];
    if (question && !window.confirm(question)) return;
    setError(null);
    try {
      await action.mutateAsync(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this draft permanently? This cannot be undone.')) return;
    try {
      await remove.mutateAsync();
      await navigate('/events', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/events/${event.id}/edit`}
          aria-disabled={event.status === 'archived'}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-black/10 ${
            event.status === 'archived'
              ? 'pointer-events-none text-muted'
              : 'bg-white hover:bg-brand-50'
          }`}
        >
          Edit
        </Link>
        {availableActions(event).map((name) => (
          <Button
            key={name}
            variant={name === 'publish' ? 'primary' : 'secondary'}
            className="w-auto! px-4 py-2.5! text-sm"
            loading={action.isPending && action.variables === name}
            disabled={action.isPending}
            onClick={() => void run(name)}
          >
            {ACTION_LABELS[name]}
          </Button>
        ))}
        {event.canDelete && (
          <Button
            variant="secondary"
            className="w-auto! px-4 py-2.5! text-sm text-danger!"
            loading={remove.isPending}
            onClick={() => void handleDelete()}
          >
            Delete draft
          </Button>
        )}
      </div>
      {!event.canDelete && event.status !== 'archived' && (
        <p className="text-xs text-muted">
          This event has been published before, so it can be archived but not deleted.
        </p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

function ImageManager({ event, canManage }: { event: AdminEventDetailDto; canManage: boolean }) {
  const upload = useEventImageUpload(event.id);
  const remove = useEventImageDelete(event.id);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = canManage && event.status !== 'archived';

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      await upload.mutateAsync(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      {event.imageUrl ? (
        <img src={event.imageUrl} alt="" className="aspect-video w-full rounded-xl object-cover" />
      ) : (
        <p className="text-sm text-muted">No image yet. Members see a branded placeholder.</p>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-xl bg-white px-4 py-2.5 text-sm font-semibold ring-1 ring-black/10 hover:bg-brand-50">
            {upload.isPending ? 'Uploading…' : event.imageUrl ? 'Replace image' : 'Upload image'}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>
          {event.imageUrl && (
            <Button
              variant="link"
              loading={remove.isPending}
              onClick={() => {
                remove.mutate(undefined);
              }}
            >
              Remove image
            </Button>
          )}
          <span className="text-xs text-muted">
            JPEG, PNG or WebP, up to 5 MB. Location data is removed automatically.
          </span>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

export function EventDetailPage() {
  const { eventId = '' } = useParams();
  const canManage = useHasPermission('events:manage');
  const query = useEvent(eventId);

  if (query.isPending) return <FullPageSpinner />;
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;
  const event = query.data;

  return (
    <div className="max-w-4xl space-y-5">
      <Link to="/events" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All events
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold">{event.name}</h1>
        <p className="flex flex-wrap items-center gap-2">
          <EventStatusBadge status={event.status} ended={event.hasEnded} />
          <VerifiedMark verified={event.isVerified} />
          <span className="font-mono text-xs text-muted">/events/{event.slug}</span>
        </p>
      </div>

      {canManage && <Actions event={event} />}

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Details">
          <Rows
            rows={[
              ['When', formatSchedule(event.eventDate, event.startTime, event.endTime)],
              ['City', `${event.city.name}${event.area ? ` · ${event.area.name}` : ''}`],
              ['Venue', event.venueName],
              ['Address', event.venueAddress],
              [
                'Organizer',
                <Link
                  key="o"
                  to={`/organizers/${event.organizer.id}`}
                  className="font-semibold hover:underline"
                >
                  {event.organizer.name}
                  {event.organizer.isVerified ? ' ✓' : ''}
                </Link>,
              ],
              [
                'Pass link',
                event.ticketUrl ? (
                  <a
                    key="t"
                    href={event.ticketUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-brand-700 hover:underline"
                  >
                    {event.ticketUrl}
                  </a>
                ) : (
                  '—'
                ),
              ],
            ]}
          />
        </Section>
        <Section title="History">
          <Rows
            rows={[
              ['Created', `${formatDateTime(event.createdAt)} by ${event.createdBy?.name ?? '—'}`],
              [
                'Last updated',
                `${formatDateTime(event.updatedAt)} by ${event.updatedBy?.name ?? '—'}`,
              ],
              ['Published', formatDateTime(event.publishedAt)],
              ['First published', formatDateTime(event.firstPublishedAt)],
              ['Verified', formatDateTime(event.verifiedAt)],
              ['Archived', formatDateTime(event.archivedAt)],
            ]}
          />
        </Section>
      </div>

      <Section title="Passes (online sales)">
        <PassSettings event={event} canManage={canManage} />
      </Section>

      <Section title="Image">
        <ImageManager event={event} canManage={canManage} />
      </Section>

      <Section title="Description">
        <p className="text-sm whitespace-pre-line">{event.description}</p>
      </Section>
    </div>
  );
}
