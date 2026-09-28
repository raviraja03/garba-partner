import type {
  ProfileStatus,
  UserStatus,
  VerificationStatus,
  VerificationType,
} from '../../constants/enums.js';
import type { OwnProfileDto, PreferencesDto, ProfileCompletionDto } from './profile.dto.js';

/** Row of `GET /api/v1/admin/users`. Never contains the phone number. */
export interface AdminUserListItemDto {
  id: string;
  name: string | null;
  accountStatus: UserStatus;
  profileStatus: ProfileStatus;
  completionPercentage: number;
  photoVerified: boolean;
  city: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  lastActiveAt: string | null;
}

/** `GET /api/v1/admin/users/:id`. Never contains the phone number (revealing it is a separate, audited action). */
export interface AdminUserDetailDto {
  id: string;
  accountStatus: UserStatus;
  profileStatus: ProfileStatus;
  completion: ProfileCompletionDto;
  photoVerified: boolean;
  hiddenFromDiscovery: boolean;
  termsVersion: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  onboardingCompletedAt: string | null;
  deletionRequestedAt: string | null;
  activeSessionCount: number;
  profile: OwnProfileDto | null;
  preferences: PreferencesDto | null;
  verifications: {
    type: VerificationType;
    status: VerificationStatus;
    createdAt: string;
    decidedAt: string | null;
  }[];
}
