import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import type { AttendanceStatus, EventDetailDto, MyAttendanceDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button, LinkButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cx } from '../components/ui/cx';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/PageHeader';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { formatEventDate } from '../features/events/event-dates';
import { useEvent } from '../features/events/hooks';
import { useMyAttendance, useSaveAttendance } from '../features/partners/hooks';
import { useMyProfile } from '../features/profile/hooks';

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  going: "I'm going",
  interested: "I'm interested",
};

function AttendanceForm({
  event,
  current,
}: {
  event: EventDetailDto;
  current: MyAttendanceDto | null;
}) {
  const save = useSaveAttendance(event.id);
  const [status, setStatus] = useState<AttendanceStatus>(current?.status ?? 'going');
  const [looking, setLooking] = useState(current?.lookingForPartner ?? true);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ status, lookingForPartner: looking });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    }
  }

  async function handleRemove() {
    setError(null);
    try {
      await save.mutateAsync(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove. Please try again.');
    }
  }

  const saved = save.data !== undefined ? save.data : current;
  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      <Card className="space-y-5">
        <fieldset>
          <legend className="text-label">Are you going?</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['going', 'interested'] as const).map((value) => (
              <label
                key={value}
                className={cx(
                  'flex min-h-12 cursor-pointer items-center justify-center rounded-control px-3 text-center text-small font-semibold ring-1 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500',
                  status === value
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-card text-ink ring-brand-200 hover:bg-brand-50',
                )}
              >
                <input
                  type="radio"
                  name="attendance-status"
                  checked={status === value}
                  onChange={() => {
                    setStatus(value);
                  }}
                  className="sr-only"
                />
                {STATUS_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-start gap-3">
          <input
            id="looking-for-partner"
            type="checkbox"
            className="mt-2.5 size-6 shrink-0 accent-brand-600"
            checked={looking}
            aria-describedby="looking-for-partner-hint"
            onChange={(e) => {
              setLooking(e.target.checked);
            }}
          />
          <div>
            <label
              htmlFor="looking-for-partner"
              className="flex min-h-11 cursor-pointer items-center font-semibold text-ink"
            >
              I&apos;m looking for a partner for this event.
            </label>
            <p id="looking-for-partner-hint" className="text-small text-muted">
              Only members who also turn this on for {event.name} can see that you&apos;re going.
              Your attendance is never shown on the event page.
            </p>
          </div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {save.isSuccess && !error && (
          <Alert tone="success">{saved ? 'Saved.' : "Removed. You're not marked as going."}</Alert>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" className="sm:w-auto" loading={save.isPending}>
            Save
          </Button>
          {saved && (
            <Button
              variant="ghost"
              className="sm:w-auto"
              disabled={save.isPending}
              onClick={() => void handleRemove()}
            >
              I&apos;m not going
            </Button>
          )}
        </div>
      </Card>
      {saved?.lookingForPartner && (
        <LinkButton to={`/discover?event=${event.id}&city=all`} variant="cta" fullWidth>
          <Icon name="compass" />
          See who&apos;s looking for a partner
        </LinkButton>
      )}
    </form>
  );
}

/**
 * Target of the event page's "Find a partner" call to action. Signed-in members with a profile
 * only (anonymous visitors are sent to log in first and brought back here).
 */
export function FindPartnerPage() {
  const { idOrSlug = '' } = useParams();
  const event = useEvent(idOrSlug);
  const profile = useMyProfile();

  if (event.isPending) return <FullPageSpinner />;
  if (event.isError) {
    return (
      <EmptyState
        icon="calendar"
        title="This event isn't available"
        action={<LinkButton to="/events">Browse events</LinkButton>}
      >
        <h1 className="sr-only">Event not available</h1>
        It may have been removed or unpublished.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find a partner"
        description={`${event.data.name} · ${formatEventDate(event.data.eventDate)}`}
        back={{ to: `/events/${event.data.slug}`, label: event.data.name }}
      />
      {event.data.hasEnded ? (
        <Alert tone="info">This event has ended.</Alert>
      ) : profile.data?.profileStatus !== 'complete' ? (
        <EmptyState
          icon="user"
          title="Finish your profile first"
          action={<LinkButton to="/profile/edit">Finish your profile</LinkButton>}
        >
          Add a profile photo to find a partner.
        </EmptyState>
      ) : (
        <AttendanceLoader event={event.data} />
      )}
    </div>
  );
}

function AttendanceLoader({ event }: { event: EventDetailDto }) {
  const attendance = useMyAttendance(event.id);
  if (attendance.isPending) return <FullPageSpinner />;
  if (attendance.isError) return <Alert tone="error">{attendance.error.message}</Alert>;
  return <AttendanceForm event={event} current={attendance.data} />;
}
