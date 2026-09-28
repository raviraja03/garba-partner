import type {
  GarbaLevel,
  Gender,
  PartnerGenderPreference,
  ProfileCompletionField,
  ProfileStatus,
} from '@garba-partner/shared';

export const GENDER_LABELS: Record<Gender, string> = {
  woman: 'Woman',
  man: 'Man',
  non_binary: 'Non-binary',
};

export const PREFERRED_GENDER_LABELS: Record<PartnerGenderPreference, string> = {
  women: 'Women',
  men: 'Men',
  everyone: 'Everyone',
};

export const GARBA_LEVEL_LABELS: Record<GarbaLevel, { label: string; hint: string }> = {
  beginner: { label: 'Beginner', hint: 'I know the basic steps' },
  intermediate: { label: 'Intermediate', hint: 'Comfortable with most styles' },
  advanced: { label: 'Advanced', hint: 'Two-taali, dodhiyu and more' },
};

export const COMPLETION_FIELD_LABELS: Record<ProfileCompletionField, string> = {
  name: 'Name',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  city: 'City',
  garbaLevel: 'Garba level',
  profileImage: 'Profile photo',
  bio: 'Bio',
  availableDates: 'Available dates',
  area: 'Area',
  instagramId: 'Instagram',
};

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  not_started: 'Not started',
  incomplete: 'Incomplete',
  complete: 'Complete',
};
