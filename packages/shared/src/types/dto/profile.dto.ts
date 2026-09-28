import type {
  GarbaLevel,
  Gender,
  PartnerGenderPreference,
  ProfileStatus,
  UserStatus,
} from '../../constants/enums.js';
import type { ProfileCompletionField } from '../../utils/profile-completion.js';

export interface CityDto {
  id: string;
  name: string;
  state: string;
}

export interface AreaDto {
  id: string;
  cityId: string;
  name: string;
}

export interface ProfileImageDto {
  /** Card-size image (portrait crop). */
  url: string;
  /** Small square thumbnail. */
  thumbnailUrl: string;
}

export interface ProfileCompletionDto {
  percentage: number;
  status: ProfileStatus;
  missingRequired: ProfileCompletionField[];
  missingOptional: ProfileCompletionField[];
}

export interface PreferencesDto {
  preferredGender: PartnerGenderPreference;
  minAge: number;
  maxAge: number;
  verifiedOnly: boolean;
  discoveryEnabled: boolean;
  showArea: boolean;
}

/** The member's own profile — includes private fields visible only to them. */
export interface OwnProfileDto {
  name: string;
  dateOfBirth: string;
  age: number;
  gender: Gender;
  city: CityDto;
  area: AreaDto | null;
  bio: string | null;
  /** Private: never shown to other members (docs/users/privacy-rules.md). */
  instagramId: string | null;
  garbaLevel: GarbaLevel;
  /** Upcoming dates only (past dates are hidden). */
  availableDates: string[];
  image: ProfileImageDto | null;
  updatedAt: string;
}

/** `GET /api/v1/me/profile`. */
export interface MyProfileDto {
  profileStatus: ProfileStatus;
  completion: ProfileCompletionDto;
  accountStatus: UserStatus;
  photoVerified: boolean;
  profile: OwnProfileDto | null;
  preferences: PreferencesDto | null;
}

/**
 * What OTHER members can see. Allow-list only: no phone, date of birth, Instagram, preferences,
 * account status, exact location or activity timestamps.
 */
export interface PublicProfileDto {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  city: { id: string; name: string };
  /** Neighbourhood; only present when the member opted in (`showArea`). */
  area: { id: string; name: string } | null;
  bio: string | null;
  garbaLevel: GarbaLevel;
  availableDates: string[];
  image: ProfileImageDto | null;
  photoVerified: boolean;
}
