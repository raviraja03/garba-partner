import { useState, type FormEvent } from 'react';
import {
  LIMITS,
  PARTNER_GENDER_PREFERENCES,
  updatePreferencesSchema,
  type PartnerGenderPreference,
  type PreferencesDto,
} from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Field } from '../../../components/ui/Field';
import { INPUT_CLASS } from '../../../components/ui/field-utils';
import { PREFERRED_GENDER_LABELS } from '../../../lib/labels';
import { fieldErrorsFromApi, fieldErrorsFromIssues, type FieldErrors } from '../form-errors';
import { useUpdatePreferences } from '../hooks';

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="block cursor-pointer font-semibold text-ink">
          {label}
        </label>
        <p id={`${id}-description`} className="text-small text-muted">
          {description}
        </p>
      </div>
      {/* A real checkbox drawn as a switch: ::before is the thumb, ::after widens the tap area. */}
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-describedby={`${id}-description`}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="relative h-8 w-14 shrink-0 cursor-pointer appearance-none rounded-full bg-brand-200 transition-colors duration-200 before:absolute before:top-1 before:left-1 before:size-6 before:rounded-full before:bg-white before:shadow-card before:transition-transform before:duration-200 checked:bg-brand-600 checked:before:translate-x-6 after:absolute after:-inset-2"
      />
    </div>
  );
}

export function PreferencesForm({
  initial,
  submitLabel,
  onSaved,
}: {
  initial: PreferencesDto;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const mutation = useUpdatePreferences();

  const set = <K extends keyof PreferencesDto>(key: K, value: PreferencesDto[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors({});
    setSaved(false);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = updatePreferencesSchema.safeParse(values);
    if (!result.success) {
      setErrors(fieldErrorsFromIssues(result.error.issues));
      return;
    }
    try {
      await mutation.mutateAsync(values);
      setSaved(true);
      onSaved?.();
    } catch (error) {
      setErrors(fieldErrorsFromApi(error));
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-6">
      <Card as="section" aria-labelledby="pr-who" className="space-y-5">
        <h2 id="pr-who" className="text-h3">
          Who you'd like to meet
        </h2>
        <Field id="preferredGender" label="I'd like to dance with">
          <select
            id="preferredGender"
            value={values.preferredGender}
            onChange={(event) => {
              set('preferredGender', event.target.value as PartnerGenderPreference);
            }}
            className={INPUT_CLASS}
          >
            {PARTNER_GENDER_PREFERENCES.map((option) => (
              <option key={option} value={option}>
                {PREFERRED_GENDER_LABELS[option]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field id="minAge" label="Minimum age" error={errors.minAge}>
            <input
              id="minAge"
              type="number"
              min={LIMITS.PREF_AGE_MIN}
              max={LIMITS.PREF_AGE_MAX}
              value={values.minAge}
              onChange={(event) => {
                set('minAge', Number(event.target.value));
              }}
              inputMode="numeric"
              aria-invalid={Boolean(errors.minAge)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field id="maxAge" label="Maximum age" error={errors.maxAge}>
            <input
              id="maxAge"
              type="number"
              min={LIMITS.PREF_AGE_MIN}
              max={LIMITS.PREF_AGE_MAX}
              value={values.maxAge}
              onChange={(event) => {
                set('maxAge', Number(event.target.value));
              }}
              inputMode="numeric"
              aria-invalid={Boolean(errors.maxAge)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <Toggle
          id="verifiedOnly"
          label="Photo-verified members only"
          description="Only suggest members whose selfie was checked by our team."
          checked={values.verifiedOnly}
          onChange={(checked) => {
            set('verifiedOnly', checked);
          }}
        />
      </Card>

      <Card as="section" aria-labelledby="pr-visible">
        <h2 id="pr-visible" className="text-h3">
          Your visibility
        </h2>
        <div className="mt-2 divide-y divide-line">
          <Toggle
            id="discoveryEnabled"
            label="Show me in partner discovery"
            description="Other adult members in your city can find your profile. You can pause this any time."
            checked={values.discoveryEnabled}
            onChange={(checked) => {
              set('discoveryEnabled', checked);
            }}
          />
          <Toggle
            id="showArea"
            label="Show my area on my profile"
            description="Your city is always shown. Your neighbourhood is only shown if you turn this on."
            checked={values.showArea}
            onChange={(checked) => {
              set('showArea', checked);
            }}
          />
        </div>
      </Card>

      {errors.form && <Alert tone="error">{errors.form}</Alert>}
      {saved && <Alert tone="success">Preferences saved.</Alert>}

      <Button type="submit" size="lg" loading={mutation.isPending}>
        {submitLabel}
      </Button>
    </form>
  );
}
