import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { EventForm } from '../features/events/EventForm';
import { EMPTY_EVENT_VALUES, eventToValues } from '../features/events/event-form-values';
import { createEvent, updateEvent } from '../features/events/events-api';
import { eventKeys, useEvent } from '../features/events/hooks';

export function NewEventPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <div className="space-y-5">
      <Link to="/events" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All events
      </Link>
      <h1 className="text-2xl font-extrabold">New event</h1>
      <p className="text-sm text-muted">
        New events are saved as drafts. Members only see an event after you publish it.
      </p>
      <EventForm
        initial={EMPTY_EVENT_VALUES}
        submitLabel="Save draft"
        onSubmit={async (input) => {
          const event = await createEvent(input);
          await queryClient.invalidateQueries({ queryKey: eventKeys.all });
          await navigate(`/events/${event.id}`);
        }}
      />
    </div>
  );
}

export function EditEventPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const event = useEvent(eventId);

  if (event.isPending) return <FullPageSpinner />;
  if (event.isError) return <Alert tone="error">{event.error.message}</Alert>;

  return (
    <div className="space-y-5">
      <Link
        to={`/events/${eventId}`}
        className="text-sm font-semibold text-brand-700 hover:underline"
      >
        ← {event.data.name}
      </Link>
      <h1 className="text-2xl font-extrabold">Edit event</h1>
      {event.data.isVerified && (
        <Alert tone="info">
          This event is verified. Changing the organizer, date, times, city, area, venue or pass
          link removes the verification until it is checked again.
        </Alert>
      )}
      <EventForm
        initial={eventToValues(event.data)}
        currentOrganizer={event.data.organizer}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          const updated = await updateEvent(eventId, input);
          queryClient.setQueryData(eventKeys.detail(eventId), updated);
          await queryClient.invalidateQueries({ queryKey: eventKeys.all });
          await navigate(`/events/${eventId}`);
        }}
      />
    </div>
  );
}
