import { useState, type FormEvent } from 'react';
import { LIMITS, createOrganizerSchema, type CreateOrganizerInput } from '@garba-partner/shared';
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
import { organizerValuesToInput, type OrganizerFormValues } from './organizer-form-values';

type Key = keyof OrganizerFormValues;

export function OrganizerForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: OrganizerFormValues;
  submitLabel: string;
  onSubmit: (input: CreateOrganizerInput) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = organizerValuesToInput(values);
    const parsed = createOrganizerSchema.safeParse(input);
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

  const control = (
    key: Key,
    label: string,
    options: {
      hint?: string;
      optional?: boolean;
      maxLength?: number;
      type?: string;
      multiline?: boolean;
    } = {},
  ) => {
    const id = `organizer-${key}`;
    const shared = {
      id,
      value: values[key],
      maxLength: options.maxLength,
      'aria-invalid': errors[key] ? true : undefined,
      'aria-describedby': describedBy(id, errors[key], Boolean(options.hint)),
      className: INPUT_CLASS,
    };
    return (
      <Field
        id={id}
        label={label}
        hint={options.hint}
        error={errors[key]}
        optional={options.optional ?? true}
      >
        {options.multiline ? (
          <textarea
            {...shared}
            rows={4}
            onChange={(e) => {
              setValues((v) => ({ ...v, [key]: e.target.value }));
            }}
          />
        ) : (
          <input
            {...shared}
            type={options.type ?? 'text'}
            onChange={(e) => {
              setValues((v) => ({ ...v, [key]: e.target.value }));
            }}
          />
        )}
      </Field>
    );
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="max-w-3xl space-y-5">
      {errors.form && <Alert tone="error">{errors.form}</Alert>}

      <section className="space-y-4 rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div>
          <h2 className="font-semibold">Public profile</h2>
          <p className="text-xs text-muted">Shown to members on event pages.</p>
        </div>
        {control('name', 'Organizer name', {
          optional: false,
          maxLength: LIMITS.ORGANIZER_NAME_MAX,
          hint: 'Changing the name, website or Instagram removes verification.',
        })}
        {control('description', 'About', {
          multiline: true,
          maxLength: LIMITS.ORGANIZER_DESCRIPTION_MAX,
          hint: 'Do not include phone numbers or email addresses.',
        })}
        <div className="grid gap-4 sm:grid-cols-2">
          {control('websiteUrl', 'Website', { type: 'url', hint: 'https:// only' })}
          {control('instagramHandle', 'Instagram', {
            hint: 'Public business handle, e.g. @garba.club',
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-card bg-amber-50 p-5 shadow-sm ring-1 ring-amber-200">
        <div>
          <h2 className="font-semibold">Private contact (admins only)</h2>
          <p className="text-xs text-muted">
            Never shown to members or returned by public APIs. Visible only to admins who can manage
            events.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {control('contactName', 'Contact person', {
            maxLength: LIMITS.ORGANIZER_CONTACT_NAME_MAX,
          })}
          {control('contactPhone', 'Contact phone', { type: 'tel' })}
        </div>
        {control('contactEmail', 'Contact email', { type: 'email' })}
        {control('notes', 'Internal notes', {
          multiline: true,
          maxLength: LIMITS.ORGANIZER_NOTES_MAX,
          hint: 'e.g. how the organizer was verified.',
        })}
      </section>

      <Button type="submit" loading={submitting} className="w-auto! px-8">
        {submitLabel}
      </Button>
    </form>
  );
}
