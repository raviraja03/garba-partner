// Shared by the API (authoritative validation) and the web forms. See docs/users/profile-validation.md.
import * as z from 'zod/mini';
import { GARBA_LEVELS, GENDERS, PARTNER_GENDER_PREFERENCES } from '../constants/enums.js';
import { LIMITS } from '../constants/limits.js';
import { isIsoDate } from '../utils/dates.js';
import { looksLikeContactInfo, normalizeText, stripInvisible } from '../utils/text.js';

/** Letters (any script), spaces, dots, apostrophes and hyphens; must start with a letter. */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
const INSTAGRAM_PATTERN = /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]+$/;

export const nameSchema = z.pipe(
  z.string().check(z.maxLength(100, 'Name is too long.')),
  z.transform((value, ctx) => {
    const name = normalizeText(stripInvisible(value));
    if (name.length < LIMITS.DISPLAY_NAME_MIN || name.length > LIMITS.DISPLAY_NAME_MAX) {
      ctx.issues.push({
        code: 'custom',
        message: `Name must be ${String(LIMITS.DISPLAY_NAME_MIN)}–${String(LIMITS.DISPLAY_NAME_MAX)} characters.`,
        input: value,
      });
    } else if (!NAME_PATTERN.test(name)) {
      ctx.issues.push({
        code: 'custom',
        message: 'Use letters only (no numbers or symbols).',
        input: value,
      });
    }
    return name;
  }),
);

export const isoDateSchema = z
  .string()
  .check(z.refine(isIsoDate, 'Enter a valid date (YYYY-MM-DD).'));

export const bioSchema = z.nullable(
  z.pipe(
    z.string().check(z.maxLength(1000, 'Bio is too long.')),
    z.transform((value, ctx) => {
      const bio = stripInvisible(value).normalize('NFKC').trim();
      if (bio.length > LIMITS.BIO_MAX_LENGTH) {
        ctx.issues.push({
          code: 'custom',
          message: `Bio must be at most ${String(LIMITS.BIO_MAX_LENGTH)} characters.`,
          input: value,
        });
      } else if (looksLikeContactInfo(bio)) {
        ctx.issues.push({
          code: 'custom',
          message: 'Please remove phone numbers, email addresses and links from your bio.',
          input: value,
        });
      }
      return bio === '' ? null : bio;
    }),
  ),
);

/** Accepts `@handle` or `handle`; stored lowercase without `@`. Empty string clears it. */
export const instagramIdSchema = z.nullable(
  z.pipe(
    z.string().check(z.maxLength(60, 'Instagram username is too long.')),
    z.transform((value, ctx) => {
      const handle = value.trim().replace(/^@/, '').toLowerCase();
      if (handle === '') return null;
      if (handle.length > LIMITS.INSTAGRAM_HANDLE_MAX || !INSTAGRAM_PATTERN.test(handle)) {
        ctx.issues.push({
          code: 'custom',
          message: 'Enter a valid Instagram username (letters, numbers, dots, underscores).',
          input: value,
        });
      }
      return handle;
    }),
  ),
);

export const availableDatesSchema = z
  .array(isoDateSchema)
  .check(
    z.maxLength(
      LIMITS.AVAILABLE_DATES_MAX,
      `Choose at most ${String(LIMITS.AVAILABLE_DATES_MAX)} dates.`,
    ),
  );

const profileFields = {
  name: nameSchema,
  gender: z.enum(GENDERS),
  cityId: z.uuid('Choose a city.'),
  areaId: z.optional(z.nullable(z.uuid('Choose an area.'))),
  bio: z.optional(bioSchema),
  instagramId: z.optional(instagramIdSchema),
  garbaLevel: z.enum(GARBA_LEVELS),
  availableDates: z.optional(availableDatesSchema),
};

/** `POST /api/v1/me/profile` (onboarding). */
export const createProfileSchema = z.strictObject({
  ...profileFields,
  dateOfBirth: isoDateSchema,
  confirmsAdult: z.literal(true, 'Please confirm that you are 18 or older.'),
  acceptTerms: z.literal(true, 'Please accept the Terms and Privacy Policy.'),
});
export type CreateProfileInput = z.input<typeof createProfileSchema>;
export type CreateProfileData = z.output<typeof createProfileSchema>;

/** `PATCH /api/v1/me/profile`. Date of birth cannot be changed (strict: the key is rejected). */
export const updateProfileSchema = z.strictObject({
  name: z.optional(profileFields.name),
  gender: z.optional(profileFields.gender),
  cityId: z.optional(profileFields.cityId),
  areaId: profileFields.areaId,
  bio: profileFields.bio,
  instagramId: profileFields.instagramId,
  garbaLevel: z.optional(profileFields.garbaLevel),
  availableDates: profileFields.availableDates,
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateProfileData = z.output<typeof updateProfileSchema>;

const ageSchema = z
  .int('Age must be a whole number.')
  .check(
    z.gte(LIMITS.PREF_AGE_MIN, `Age must be at least ${String(LIMITS.PREF_AGE_MIN)}.`),
    z.lte(LIMITS.PREF_AGE_MAX, `Age must be at most ${String(LIMITS.PREF_AGE_MAX)}.`),
  );

/** `PUT /api/v1/me/preferences` (partial update). */
export const updatePreferencesSchema = z
  .strictObject({
    preferredGender: z.optional(z.enum(PARTNER_GENDER_PREFERENCES)),
    minAge: z.optional(ageSchema),
    maxAge: z.optional(ageSchema),
    verifiedOnly: z.optional(z.boolean()),
    discoveryEnabled: z.optional(z.boolean()),
    showArea: z.optional(z.boolean()),
  })
  .check(
    z.refine(
      (value) =>
        value.minAge === undefined || value.maxAge === undefined || value.minAge <= value.maxAge,
      { message: 'Minimum age cannot be greater than maximum age.', path: ['minAge'] },
    ),
  );
export type UpdatePreferencesInput = z.input<typeof updatePreferencesSchema>;
export type UpdatePreferencesData = z.output<typeof updatePreferencesSchema>;

export const uuidParamSchema = z.uuid('Invalid identifier.');
