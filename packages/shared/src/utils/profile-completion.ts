import type { ProfileStatus } from '../constants/enums.js';

/**
 * Profile completion (docs/users/user-profile.md#profile-completion). Required fields decide the
 * status; weights decide the percentage. Weights add up to 100.
 */
export const PROFILE_COMPLETION_ITEMS = [
  { field: 'name', weight: 10, required: true },
  { field: 'dateOfBirth', weight: 10, required: true },
  { field: 'gender', weight: 10, required: true },
  { field: 'city', weight: 10, required: true },
  { field: 'garbaLevel', weight: 10, required: true },
  { field: 'profileImage', weight: 20, required: true },
  { field: 'bio', weight: 10, required: false },
  { field: 'availableDates', weight: 10, required: false },
  { field: 'area', weight: 5, required: false },
  { field: 'instagramId', weight: 5, required: false },
] as const;

export type ProfileCompletionField = (typeof PROFILE_COMPLETION_ITEMS)[number]['field'];

/** Which fields are filled in. `null` profile = no profile yet. */
export type ProfileCompletionInput = Record<ProfileCompletionField, boolean> | null;

export interface ProfileCompletion {
  /** 0–100, rounded down. */
  percentage: number;
  status: ProfileStatus;
  missingRequired: ProfileCompletionField[];
  missingOptional: ProfileCompletionField[];
}

export function computeProfileCompletion(filled: ProfileCompletionInput): ProfileCompletion {
  if (!filled) {
    return {
      percentage: 0,
      status: 'not_started',
      missingRequired: PROFILE_COMPLETION_ITEMS.filter((i) => i.required).map((i) => i.field),
      missingOptional: PROFILE_COMPLETION_ITEMS.filter((i) => !i.required).map((i) => i.field),
    };
  }

  let percentage = 0;
  const missingRequired: ProfileCompletionField[] = [];
  const missingOptional: ProfileCompletionField[] = [];
  for (const item of PROFILE_COMPLETION_ITEMS) {
    if (filled[item.field]) percentage += item.weight;
    else if (item.required) missingRequired.push(item.field);
    else missingOptional.push(item.field);
  }

  return {
    percentage: Math.floor(percentage),
    status: missingRequired.length === 0 ? 'complete' : 'incomplete',
    missingRequired,
    missingOptional,
  };
}
