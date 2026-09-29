import {
  calculateAge,
  computeProfileCompletion,
  type OwnProfileDto,
  type PreferencesDto,
  type ProfileCompletion,
  type ProfileImageDto,
  type PublicProfileDto,
} from '@garba-partner/shared';
import type { User, UserPreference, UserProfile } from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import { toAreaDto, toCityDto } from '../locations/locations.service.js';

/**
 * DTO mappers. Every mapper is an ALLOW-LIST: fields are copied explicitly, never spread from a
 * model, so new columns can never leak by accident (docs/users/privacy-rules.md).
 */

export function toImageDto(
  profile: Pick<UserProfile, 'imagePublicId'>,
  storage: MediaStorage,
): ProfileImageDto | null {
  if (!profile.imagePublicId) return null;
  return {
    url: storage.url(profile.imagePublicId, 'card'),
    thumbnailUrl: storage.url(profile.imagePublicId, 'thumbnail'),
  };
}

/** Upcoming dates only — past dates are never shown. */
export function upcomingDates(dates: readonly string[], today: string): string[] {
  return dates.filter((date) => date >= today);
}

export function computeCompletion(profile: UserProfile | null, today: string): ProfileCompletion {
  if (!profile) return computeProfileCompletion(null);
  return computeProfileCompletion({
    name: profile.displayName.length > 0,
    dateOfBirth: profile.dateOfBirth.length > 0,
    gender: true,
    city: profile.cityId.length > 0,
    garbaLevel: true,
    profileImage: profile.imagePublicId !== null,
    bio: profile.bio !== null && profile.bio.length > 0,
    availableDates: upcomingDates(profile.availableDates, today).length > 0,
    area: profile.areaId !== null,
    instagramId: profile.instagramHandle !== null,
  });
}

export function toPreferencesDto(
  preferences: UserPreference | null | undefined,
): PreferencesDto | null {
  if (!preferences) return null;
  return {
    preferredGender: preferences.partnerGenderPreference,
    minAge: preferences.ageMin,
    maxAge: preferences.ageMax,
    verifiedOnly: preferences.verifiedOnly,
    discoveryEnabled: preferences.discoveryEnabled,
    showArea: preferences.showArea,
  };
}

/** The owner's view (and the admin detail view). Requires `city` and `area` to be loaded. */
export function toOwnProfileDto(
  profile: UserProfile,
  storage: MediaStorage,
  today: string,
): OwnProfileDto {
  if (!profile.city) throw new Error('Profile city must be loaded');
  return {
    name: profile.displayName,
    dateOfBirth: profile.dateOfBirth,
    age: calculateAge(profile.dateOfBirth, today),
    gender: profile.gender,
    city: toCityDto(profile.city),
    area: profile.area ? toAreaDto(profile.area) : null,
    bio: profile.bio,
    instagramId: profile.instagramHandle,
    garbaLevel: profile.garbaLevel,
    availableDates: upcomingDates(profile.availableDates, today),
    image: toImageDto(profile, storage),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

/**
 * What other members see. NEVER includes: phone, date of birth (age only), Instagram handle,
 * preferences, account status, verification details, activity timestamps, or the area unless the
 * member opted in with `showArea`.
 */
export function toPublicProfileDto(
  user: Pick<User, 'id' | 'photoVerifiedAt' | 'identityVerifiedAt'>,
  profile: UserProfile,
  preferences: UserPreference | null | undefined,
  storage: MediaStorage,
  today: string,
): PublicProfileDto {
  if (!profile.city) throw new Error('Profile city must be loaded');
  const showArea = preferences?.showArea === true && profile.area;
  return {
    id: user.id,
    name: profile.displayName,
    age: calculateAge(profile.dateOfBirth, today),
    gender: profile.gender,
    city: { id: profile.city.id, name: profile.city.name },
    area: showArea && profile.area ? { id: profile.area.id, name: profile.area.name } : null,
    bio: profile.bio,
    garbaLevel: profile.garbaLevel,
    availableDates: upcomingDates(profile.availableDates, today),
    image: toImageDto(profile, storage),
    // Every member signs in with a one-time code, so the phone number is always verified.
    phoneVerified: true,
    identityVerified: user.identityVerifiedAt !== null,
    photoVerified: user.photoVerifiedAt !== null,
  };
}
