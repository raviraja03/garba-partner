import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  GARBA_LEVELS,
  GENDERS,
  LIMITS,
  createProfileSchema,
  looksLikeContactInfo,
  todayInIndia,
  updateProfileSchema,
  type CreateProfileInput,
  type GarbaLevel,
  type Gender,
  type OwnProfileDto,
  type UpdateProfileInput,
} from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cx } from '../../../components/ui/cx';
import { Field } from '../../../components/ui/Field';
import { INPUT_CLASS, describedBy } from '../../../components/ui/field-utils';
import { GARBA_LEVEL_LABELS, GENDER_LABELS } from '../../../lib/labels';
import { fieldErrorsFromApi, fieldErrorsFromIssues, type FieldErrors } from '../form-errors';
import { useAreas, useCities } from '../hooks';
import { AvailableDatesInput } from './AvailableDatesInput';
import { TEXT_LINK } from '../../../components/ui/link-styles';

interface Values {
  name: string;
  dateOfBirth: string;
  gender: Gender | '';
  cityId: string;
  areaId: string;
  bio: string;
  instagramId: string;
  garbaLevel: GarbaLevel | '';
  availableDates: string[];
  confirmsAdult: boolean;
  acceptTerms: boolean;
}

type Props =
  | {
      mode: 'create';
      onCreate: (input: CreateProfileInput) => Promise<unknown>;
      submitLabel: string;
    }
  | {
      mode: 'edit';
      initial: OwnProfileDto;
      onUpdate: (input: UpdateProfileInput) => Promise<unknown>;
      submitLabel: string;
    };

/** Latest date of birth that is 18+ today (IST), for the date picker's max. */
function latestAdultDob(): string {
  const today = todayInIndia();
  return `${String(Number(today.slice(0, 4)) - LIMITS.MIN_AGE)}${today.slice(4)}`;
}

function initialValues(props: Props): Values {
  if (props.mode === 'create') {
    return {
      name: '',
      dateOfBirth: '',
      gender: '',
      cityId: '',
      areaId: '',
      bio: '',
      instagramId: '',
      garbaLevel: '',
      availableDates: [],
      confirmsAdult: false,
      acceptTerms: false,
    };
  }
  const p = props.initial;
  return {
    name: p.name,
    dateOfBirth: p.dateOfBirth,
    gender: p.gender,
    cityId: p.city.id,
    areaId: p.area?.id ?? '',
    bio: p.bio ?? '',
    instagramId: p.instagramId ?? '',
    garbaLevel: p.garbaLevel,
    availableDates: p.availableDates,
    confirmsAdult: true,
    acceptTerms: true,
  };
}

export function ProfileForm(props: Props) {
  const [values, setValues] = useState<Values>(() => initialValues(props));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const cities = useCities();
  const areas = useAreas(values.cityId || null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  };

  const common = {
    name: values.name,
    gender: values.gender,
    cityId: values.cityId,
    areaId: values.areaId || null,
    bio: values.bio,
    instagramId: values.instagramId,
    garbaLevel: values.garbaLevel,
    availableDates: values.availableDates,
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Same shared schema as the API: instant feedback, the server stays authoritative.
    const result =
      props.mode === 'create'
        ? createProfileSchema.safeParse({
            ...common,
            dateOfBirth: values.dateOfBirth,
            confirmsAdult: values.confirmsAdult,
            acceptTerms: values.acceptTerms,
          })
        : updateProfileSchema.safeParse(common);
    if (!result.success) {
      setErrors(fieldErrorsFromIssues(result.error.issues));
      return;
    }

    setSubmitting(true);
    try {
      if (props.mode === 'create') {
        await props.onCreate({
          ...(common as Omit<CreateProfileInput, 'dateOfBirth' | 'confirmsAdult' | 'acceptTerms'>),
          dateOfBirth: values.dateOfBirth,
          confirmsAdult: true,
          acceptTerms: true,
        });
      } else {
        await props.onUpdate(common as UpdateProfileInput);
      }
    } catch (error) {
      setErrors(fieldErrorsFromApi(error));
    } finally {
      setSubmitting(false);
    }
  }

  const bioHasContact = values.bio.length > 0 && looksLikeContactInfo(values.bio);

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-6">
      <Card as="section" aria-labelledby="pf-about" className="space-y-5">
        <h2 id="pf-about" className="text-h3">
          About you
        </h2>
        <Field id="name" label="First name" error={errors.name} hint="Shown to other members.">
          <input
            id="name"
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={LIMITS.DISPLAY_NAME_MAX}
            value={values.name}
            onChange={(event) => {
              set('name', event.target.value);
            }}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy('name', errors.name, true)}
            className={INPUT_CLASS}
          />
        </Field>

        {props.mode === 'create' ? (
          <Field
            id="dateOfBirth"
            label="Date of birth"
            error={errors.dateOfBirth}
            hint="Only your age is shown. You can't change this later."
          >
            <input
              id="dateOfBirth"
              type="date"
              max={latestAdultDob()}
              value={values.dateOfBirth}
              onChange={(event) => {
                set('dateOfBirth', event.target.value);
              }}
              aria-invalid={Boolean(errors.dateOfBirth)}
              aria-describedby={describedBy('dateOfBirth', errors.dateOfBirth, true)}
              className={INPUT_CLASS}
            />
          </Field>
        ) : null}

        <fieldset>
          <legend className="text-label">Gender</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {GENDERS.map((gender) => (
              <label
                key={gender}
                className={cx(
                  'flex min-h-11 cursor-pointer items-center rounded-full px-5 text-small font-semibold ring-1 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500',
                  values.gender === gender
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-card text-ink ring-brand-200 hover:bg-brand-50',
                )}
              >
                <input
                  type="radio"
                  name="gender"
                  value={gender}
                  checked={values.gender === gender}
                  onChange={() => {
                    set('gender', gender);
                  }}
                  className="sr-only"
                />
                {GENDER_LABELS[gender]}
              </label>
            ))}
          </div>
          {errors.gender && (
            <p role="alert" className="mt-1.5 text-small font-medium text-danger">
              Choose your gender.
            </p>
          )}
        </fieldset>
      </Card>

      <Card as="section" aria-labelledby="pf-where" className="space-y-5">
        <h2 id="pf-where" className="text-h3">
          Where you dance
        </h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="cityId" label="City" error={errors.cityId}>
            <select
              id="cityId"
              value={values.cityId}
              onChange={(event) => {
                setValues((current) => ({ ...current, cityId: event.target.value, areaId: '' }));
                setErrors((current) => ({ ...current, cityId: undefined, areaId: undefined }));
              }}
              aria-invalid={Boolean(errors.cityId)}
              className={INPUT_CLASS}
            >
              <option value="">Choose a city</option>
              {cities.data?.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}, {city.state}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id="areaId"
            label="Area"
            optional
            error={errors.areaId}
            hint="Neighbourhood only — never your address. Hidden unless you choose to show it."
          >
            <select
              id="areaId"
              value={values.areaId}
              disabled={!values.cityId}
              onChange={(event) => {
                set('areaId', event.target.value);
              }}
              aria-invalid={Boolean(errors.areaId)}
              aria-describedby={describedBy('areaId', errors.areaId, true)}
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
      </Card>

      <Card as="section" aria-labelledby="pf-garba" className="space-y-5">
        <h2 id="pf-garba" className="text-h3">
          Your Garba
        </h2>
        <fieldset>
          <legend className="text-label">Garba level</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {GARBA_LEVELS.map((level) => (
              <label
                key={level}
                className={cx(
                  'flex min-h-16 cursor-pointer flex-col justify-center rounded-control px-4 py-3 text-small ring-1 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500',
                  values.garbaLevel === level
                    ? 'bg-brand-50 ring-2 ring-brand-600'
                    : 'bg-card ring-brand-200 hover:bg-brand-50',
                )}
              >
                <input
                  type="radio"
                  name="garbaLevel"
                  value={level}
                  checked={values.garbaLevel === level}
                  onChange={() => {
                    set('garbaLevel', level);
                  }}
                  className="sr-only"
                />
                <span className="block font-semibold">{GARBA_LEVEL_LABELS[level].label}</span>
                <span className="text-muted">{GARBA_LEVEL_LABELS[level].hint}</span>
              </label>
            ))}
          </div>
          {errors.garbaLevel && (
            <p role="alert" className="mt-1.5 text-small font-medium text-danger">
              Choose your level.
            </p>
          )}
        </fieldset>

        <Field
          id="availableDates"
          label="Dates you're free for Garba"
          optional
          error={errors.availableDates}
          hint={`Up to ${String(LIMITS.AVAILABLE_DATES_MAX)} dates in the next 12 months.`}
        >
          <AvailableDatesInput
            id="availableDates"
            value={values.availableDates}
            onChange={(dates) => {
              set('availableDates', dates);
            }}
            invalid={Boolean(errors.availableDates)}
          />
        </Field>
      </Card>

      <Card as="section" aria-labelledby="pf-more" className="space-y-5">
        <h2 id="pf-more" className="text-h3">
          More about you
        </h2>
        <Field
          id="bio"
          label="About you"
          optional
          error={
            errors.bio ??
            (bioHasContact ? 'Please remove phone numbers, emails and links.' : undefined)
          }
          hint={`${String(values.bio.length)}/${String(LIMITS.BIO_MAX_LENGTH)} — no phone numbers, emails or links.`}
        >
          <textarea
            id="bio"
            rows={3}
            maxLength={LIMITS.BIO_MAX_LENGTH}
            value={values.bio}
            onChange={(event) => {
              set('bio', event.target.value);
            }}
            aria-invalid={Boolean(errors.bio) || bioHasContact}
            aria-describedby={describedBy('bio', errors.bio, true)}
            className={INPUT_CLASS}
          />
        </Field>

        <Field
          id="instagramId"
          label="Instagram username"
          optional
          error={errors.instagramId}
          hint="Private — never shown on your profile."
        >
          <input
            id="instagramId"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="@username"
            value={values.instagramId}
            onChange={(event) => {
              set('instagramId', event.target.value);
            }}
            aria-invalid={Boolean(errors.instagramId)}
            aria-describedby={describedBy('instagramId', errors.instagramId, true)}
            className={INPUT_CLASS}
          />
        </Field>
      </Card>

      {props.mode === 'create' && (
        <Card as="section" aria-label="Confirmations" padding="sm" className="space-y-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body">
            <input
              type="checkbox"
              checked={values.confirmsAdult}
              onChange={(event) => {
                set('confirmsAdult', event.target.checked);
              }}
              aria-invalid={Boolean(errors.confirmsAdult)}
              className="size-5 shrink-0 accent-brand-600"
            />
            <span>I confirm that I am 18 or older.</span>
          </label>
          {errors.confirmsAdult && (
            <p role="alert" className="pb-1 pl-8 text-small font-medium text-danger">
              {errors.confirmsAdult}
            </p>
          )}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body">
            <input
              type="checkbox"
              checked={values.acceptTerms}
              onChange={(event) => {
                set('acceptTerms', event.target.checked);
              }}
              aria-invalid={Boolean(errors.acceptTerms)}
              className="size-5 shrink-0 accent-brand-600"
            />
            <span>I accept the Terms of Service, Privacy Policy and Community Guidelines.</span>
          </label>
          {errors.acceptTerms && (
            <p role="alert" className="pb-1 pl-8 text-small font-medium text-danger">
              {errors.acceptTerms}
            </p>
          )}
          <p className="pt-1 pl-8 text-caption text-muted">
            Read the{' '}
            <Link to="/guidelines" target="_blank" className={TEXT_LINK}>
              community guidelines
            </Link>
            .
          </p>
        </Card>
      )}

      {errors.form && <Alert tone="error">{errors.form}</Alert>}

      <Button type="submit" size="lg" loading={submitting}>
        {props.submitLabel}
      </Button>
    </form>
  );
}
