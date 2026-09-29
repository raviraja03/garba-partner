import type {
  GarbaLevel,
  Gender,
  MatchHighlight,
  PartnerGenderPreference,
  ProfileCompletionField,
  ProfileStatus,
  ReportReason,
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

/** Why someone was suggested. Plain reasons, never a compatibility score. */
export const MATCH_HIGHLIGHT_LABELS: Record<MatchHighlight, string> = {
  same_event: 'Going to the same event',
  shared_dates: 'Free on the same dates',
  same_city: 'In your city',
  similar_age: 'Similar age',
  same_level: 'Same Garba level',
  verified: 'Verified',
};

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  underage: 'Seems to be under 18',
  safety_threat: 'Threat to my safety',
  harassment: 'Harassment or bullying',
  sexual_content: 'Sexual or explicit content',
  hate_speech: 'Hate speech',
  scam_spam: 'Scam, spam or asking for money',
  fake_profile: 'Fake profile or impersonation',
  other: 'Something else',
};

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  not_started: 'Not started',
  incomplete: 'Incomplete',
  complete: 'Complete',
};
