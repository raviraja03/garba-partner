import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { AttendanceStatus, EventDetailDto, MyAttendanceDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
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
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-card bg-white p-6 shadow-sm ring-1 ring-black/5"
    >
      <fieldset className="flex gap-4">
        <legend className="mb-2 text-sm font-semibold">Are you going?</legend>
        {(['going', 'interested'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="attendance-status"
              checked={status === value}
              onChange={() => {
                setStatus(value);
              }}
            />
            {STATUS_LABELS[value]}
          </label>
        ))}
      </fieldset>
      <div className="flex items-start gap-2 text-sm">
        <input
          id="looking-for-partner"
          type="checkbox"
          className="mt-1"
          checked={looking}
          aria-describedby="looking-for-partner-hint"
          onChange={(e) => {
            setLooking(e.target.checked);
          }}
        />
        <div>
          <label htmlFor="looking-for-partner" className="font-semibold">
            I&apos;m looking for a partner for this event.
          </label>
          <p id="looking-for-partner-hint" className="text-muted">
            Only members who also turn this on for {event.name} can see that you&apos;re going. Your
            attendance is never shown on the event page.
          </p>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" className="w-auto! px-6" loading={save.isPending}>
          Save
        </Button>
        {saved && (
          <Button variant="link" disabled={save.isPending} onClick={() => void handleRemove()}>
            I&apos;m not going
          </Button>
        )}
      </div>
      {saved?.lookingForPartner && (
        <Link
          to={`/discover?event=${event.id}&city=all`}
          className="inline-block rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
        >
          See who&apos;s looking for a partner here
        </Link>
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
  if (event.isError) return <Alert tone="error">This event is not available.</Alert>;

  return (
    <div className="space-y-6">
      <Link
        to={`/events/${event.data.slug}`}
        className="text-sm font-semibold text-brand-700 hover:underline"
      >
        ← {event.data.name}
      </Link>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Find a partner</h1>
        <p className="mt-1 text-sm text-muted">
          {event.data.name} · {formatEventDate(event.data.eventDate)}
        </p>
      </div>
      {event.data.hasEnded ? (
        <Alert tone="info">This event has ended.</Alert>
      ) : profile.data?.profileStatus !== 'complete' ? (
        <Alert tone="info">
          Add a profile photo to find a partner.{' '}
          <Link to="/profile/edit" className="font-semibold underline">
            Finish your profile
          </Link>
        </Alert>
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
