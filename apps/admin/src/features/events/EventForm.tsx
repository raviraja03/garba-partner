import { useState, type FormEvent } from 'react';
import {
  LIMITS,
  createEventSchema,
  todayInIndia,
  type CreateEventInput,
  type PublicOrganizerSummaryDto,
} from '@garba-partner/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { INPUT_CLASS } from '../../components/ui/styles';
import {
  apiErrorToErrors,
  describedBy,
  issuesToErrors,
  type FieldErrors,
} from '../../lib/form-errors';
import { useOrganizerOptions } from '../organizers/hooks';
import { valuesToInput, type EventFormValues } from './event-form-values';
import { useAreas, useCities } from './hooks';

/**
 * Create/edit form. Validated with the same shared schema the API uses; the API re-validates
 * (and additionally checks the date is not in the past, the area belongs to the city and the
 * organizer is active).
 */
export function EventForm({
  initial,
  currentOrganizer,
  submitLabel,
  onSubmit,
}: {
  initial: EventFormValues;
  /** The event's current organizer, shown even if it is now archived. */
  currentOrganizer?: PublicOrganizerSummaryDto;
  submitLabel: string;
  onSubmit: (input: CreateEventInput) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const organizers = useOrganizerOptions();
  const cities = useCities();
  const areas = useAreas(values.cityId);

  const organizerOptions = organizers.data ?? [];
  const showCurrent =
    currentOrganizer && !organizerOptions.some((o) => o.id === currentOrganizer.id);

  function set<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    setValues((previous) => ({
      ...previous,
      [key]: value,
      // A new city invalidates the chosen area.
      ...(key === 'cityId' ? { areaId: '' } : {}),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = valuesToInput(values);
    const parsed = createEventSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      await onSubmit(input);
    } catch (error) {
      setErrors(apiErrorToErrors(error));
    } finally {
      setSubmitting(false);
    }
  }

  const text = (
    key: keyof EventFormValues,
    label: string,
    options: { hint?: string; optional?: boolean; maxLength?: number; type?: string } = {},
  ) => {
    const id = `event-${key}`;
    return (
      <Field
        id={id}
        label={label}
        hint={options.hint}
        error={errors[key]}
        optional={options.optional ?? false}
      >
        <input
          id={id}
          type={options.type ?? 'text'}
          value={values[key]}
          maxLength={options.maxLength}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={describedBy(id, errors[key], Boolean(options.hint))}
          onChange={(e) => {
            set(key, e.target.value);
          }}
          className={INPUT_CLASS}
          {...(options.type === 'date' ? { min: todayInIndia() } : {})}
        />
      </Field>
    );
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="max-w-3xl space-y-5">
      {errors.form && <Alert tone="error">{errors.form}</Alert>}

      <section className="space-y-4 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold">Event</h2>
        {text('name', 'Event name', { maxLength: LIMITS.EVENT_NAME_MAX })}
        <Field
          id="event-description"
          label="Description"
          hint="Public. Do not include phone numbers or email addresses."
          error={errors.description}
        >
          <textarea
            id="event-description"
            rows={6}
            maxLength={LIMITS.EVENT_DESCRIPTION_MAX}
            value={values.description}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={describedBy('event-description', errors.description, true)}
            onChange={(e) => {
              set('description', e.target.value);
            }}
            className={INPUT_CLASS}
          />
        </Field>
        <Field id="event-organizerId" label="Organizer" error={errors.organizerId}>
          <select
            id="event-organizerId"
            value={values.organizerId}
            aria-invalid={errors.organizerId ? true : undefined}
            onChange={(e) => {
              set('organizerId', e.target.value);
            }}
            className={INPUT_CLASS}
          >
            <option value="">Choose an organizer…</option>
            {showCurrent && (
              <option value={currentOrganizer.id} disabled>
                {currentOrganizer.name} (archived)
              </option>
            )}
            {organizerOptions.map((organizer) => (
              <option key={organizer.id} value={organizer.id}>
                {organizer.name}
                {organizer.isVerified ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="space-y-4 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold">When (India Standard Time)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {text('eventDate', 'Date', { type: 'date' })}
          {text('startTime', 'Starts', { type: 'time' })}
          {text('endTime', 'Ends', { type: 'time' })}
        </div>
        <p className="text-xs text-muted">
          An end time earlier than the start time means the event ends after midnight.
        </p>
      </section>

      <section className="space-y-4 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold">Where</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="event-cityId" label="City" error={errors.cityId}>
            <select
              id="event-cityId"
              value={values.cityId}
              aria-invalid={errors.cityId ? true : undefined}
              onChange={(e) => {
                set('cityId', e.target.value);
              }}
              className={INPUT_CLASS}
            >
              <option value="">Choose a city…</option>
              {cities.data?.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="event-areaId" label="Area" optional error={errors.areaId}>
            <select
              id="event-areaId"
              value={values.areaId}
              disabled={!values.cityId}
              onChange={(e) => {
                set('areaId', e.target.value);
              }}
              className={INPUT_CLASS}
            >
              <option value="">No area</option>
              {areas.data?.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {text('venueName', 'Venue name', { maxLength: LIMITS.EVENT_VENUE_NAME_MAX })}
        {text('venueAddress', 'Venue address', {
          hint: 'The public address of the venue.',
          maxLength: LIMITS.EVENT_VENUE_ADDRESS_MAX,
        })}
      </section>

      <section className="space-y-4 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold">Passes</h2>
        {text('ticketUrl', 'Ticket / pass link', {
          optional: true,
          type: 'url',
          hint: 'Must start with https://. Members see it as “Get pass”. Changing it removes event verification.',
          maxLength: LIMITS.EVENT_URL_MAX,
        })}
      </section>

      <Button type="submit" loading={submitting} className="w-auto! px-8">
        {submitLabel}
      </Button>
    </form>
  );
}
