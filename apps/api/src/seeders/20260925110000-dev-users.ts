import { createHash } from 'node:crypto';
import type { MigrationFn } from 'umzug';
import type {
  DanceStyle,
  ExperienceLevel,
  Gender,
  PartnerGenderPreference,
  UserStatus,
  VerificationFailureReason,
  VerificationStatus,
} from '@garba-partner/shared';
import type { SeederContext } from '../config/umzug.js';
import { encryptString, hashPhone } from '../lib/crypto.js';
import {
  User,
  UserPreference,
  UserProfile,
  UserSession,
  UserVerification,
} from '../models/index.js';

/**
 * Safe development data: fictional people, obviously fake phone numbers (no SMS is ever sent
 * in development), no real photos and no identity documents. Never runs in production.
 */

const TERMS_VERSION = '2026-09-01';
const DAY_MS = 24 * 60 * 60 * 1000;

interface SeedUser {
  id: string;
  phone: string;
  status: UserStatus;
  profile?: {
    displayName: string;
    dateOfBirth: string;
    gender: Gender;
    bio: string | null;
    experience: ExperienceLevel;
    styles: DanceStyle[];
  };
  preferences?: {
    partnerGenderPreference: PartnerGenderPreference;
    ageMin: number;
    ageMax: number;
    discoveryEnabled: boolean;
  };
  verification?: {
    status: VerificationStatus;
    failureReason?: VerificationFailureReason;
  };
}

const SEED_USERS: readonly SeedUser[] = [
  {
    id: 'a1f0c3de-0001-4000-8000-000000000001',
    phone: '+919999900001',
    status: 'active',
    profile: {
      displayName: 'Priya',
      dateOfBirth: '2000-03-14',
      gender: 'woman',
      bio: 'Dancing since school — two-taali to dodhiyu. Looking for someone who can keep up!',
      experience: 'advanced',
      styles: ['garba', 'dandiya_raas'],
    },
    preferences: {
      partnerGenderPreference: 'everyone',
      ageMin: 22,
      ageMax: 35,
      discoveryEnabled: true,
    },
    verification: { status: 'approved' },
  },
  {
    id: 'a1f0c3de-0002-4000-8000-000000000002',
    phone: '+919999900002',
    status: 'active',
    profile: {
      displayName: 'Rohan',
      dateOfBirth: '1997-07-02',
      gender: 'man',
      bio: 'Competition dancer. Need a partner who knows the steps.',
      experience: 'advanced',
      styles: ['garba'],
    },
    preferences: {
      partnerGenderPreference: 'women',
      ageMin: 24,
      ageMax: 34,
      discoveryEnabled: true,
    },
    verification: { status: 'pending' },
  },
  {
    id: 'a1f0c3de-0003-4000-8000-000000000003',
    phone: '+919999900003',
    status: 'active',
    profile: {
      displayName: 'Kavya',
      dateOfBirth: '2004-01-20',
      gender: 'woman',
      bio: 'First Navratri in Surat. Happy to meet at the venue.',
      experience: 'beginner',
      styles: ['garba'],
    },
    preferences: {
      partnerGenderPreference: 'men',
      ageMin: 21,
      ageMax: 28,
      discoveryEnabled: true,
    },
  },
  {
    id: 'a1f0c3de-0004-4000-8000-000000000004',
    phone: '+919999900004',
    status: 'active',
    profile: {
      displayName: 'Arjun',
      dateOfBirth: '1992-11-09',
      gender: 'man',
      bio: null,
      experience: 'intermediate',
      styles: ['dandiya_raas'],
    },
    // Browses events only: not discoverable.
    preferences: {
      partnerGenderPreference: 'everyone',
      ageMin: 25,
      ageMax: 45,
      discoveryEnabled: false,
    },
  },
  {
    id: 'a1f0c3de-0005-4000-8000-000000000005',
    phone: '+919999900005',
    status: 'active',
    profile: {
      displayName: 'Sam',
      dateOfBirth: '1999-05-27',
      gender: 'non_binary',
      bio: 'Here for the music and the circle.',
      experience: 'intermediate',
      styles: ['garba', 'dandiya_raas'],
    },
    preferences: {
      partnerGenderPreference: 'everyone',
      ageMin: 21,
      ageMax: 40,
      discoveryEnabled: true,
    },
    verification: { status: 'rejected', failureReason: 'does_not_match_photos' },
  },
  {
    // Verified phone, onboarding not finished (no profile yet).
    id: 'a1f0c3de-0006-4000-8000-000000000006',
    phone: '+919999900006',
    status: 'active',
  },
  {
    id: 'a1f0c3de-0007-4000-8000-000000000007',
    phone: '+919999900007',
    status: 'suspended',
    profile: {
      displayName: 'Vikram',
      dateOfBirth: '1995-02-11',
      gender: 'man',
      bio: null,
      experience: 'beginner',
      styles: ['garba'],
    },
    preferences: {
      partnerGenderPreference: 'women',
      ageMin: 20,
      ageMax: 30,
      discoveryEnabled: true,
    },
  },
  {
    id: 'a1f0c3de-0008-4000-8000-000000000008',
    phone: '+919999900008',
    status: 'pending_deletion',
    profile: {
      displayName: 'Neha',
      dateOfBirth: '1998-09-30',
      gender: 'woman',
      bio: null,
      experience: 'intermediate',
      styles: ['garba'],
    },
    preferences: {
      partnerGenderPreference: 'everyone',
      ageMin: 22,
      ageMax: 32,
      discoveryEnabled: false,
    },
  },
];

export const SEED_USER_IDS = SEED_USERS.map((user) => user.id);

/** Deterministic, obviously fake token hash (no refresh tokens exist before the auth phase). */
function fakeTokenHash(label: string): string {
  return createHash('sha256').update(`dev-seed:${label}`).digest('hex');
}

export const up: MigrationFn<SeederContext> = async ({ context: { sequelize, env } }) => {
  if (env.APP_ENV === 'production') throw new Error('Development seeders never run in production');

  const hashSecret = env.PHONE_HASH_SECRET;
  const encryptionKey = env.PHONE_ENCRYPTION_KEY;
  if (!hashSecret || !encryptionKey) {
    throw new Error(
      'PHONE_HASH_SECRET and PHONE_ENCRYPTION_KEY are required to seed users (see docs/database/database-setup.md)',
    );
  }

  const now = Date.now();

  await sequelize.transaction(async (transaction) => {
    for (const seed of SEED_USERS) {
      const onboarded = seed.profile !== undefined;
      const verified = seed.verification?.status === 'approved';

      await User.create(
        {
          id: seed.id,
          phoneHash: hashPhone(seed.phone, hashSecret),
          phoneEncrypted: encryptString(seed.phone, encryptionKey),
          phoneKeyVersion: env.PHONE_ENCRYPTION_KEY_VERSION,
          status: seed.status,
          onboardingCompletedAt: onboarded ? new Date(now - 20 * DAY_MS) : null,
          termsVersion: onboarded ? TERMS_VERSION : null,
          termsAcceptedAt: onboarded ? new Date(now - 20 * DAY_MS) : null,
          photoVerifiedAt: verified ? new Date(now - 10 * DAY_MS) : null,
          lastActiveAt: new Date(now - DAY_MS),
          deletionRequestedAt:
            seed.status === 'pending_deletion' ? new Date(now - 2 * DAY_MS) : null,
        },
        { transaction },
      );

      if (seed.profile) {
        await UserProfile.create({ userId: seed.id, ...seed.profile }, { transaction });
      }
      if (seed.preferences) {
        await UserPreference.create({ userId: seed.id, ...seed.preferences }, { transaction });
      }
      if (seed.verification) {
        const decided = ['approved', 'rejected'].includes(seed.verification.status);
        await UserVerification.create(
          {
            userId: seed.id,
            type: 'photo',
            provider: 'internal_review',
            status: seed.verification.status,
            challengeCode: 'thumbs_up_left_hand',
            // Pending reviews point at (fictional) private evidence; decided ones were purged.
            evidenceReference: decided ? null : `dev/verification/${seed.id}/selfie`,
            evidenceDeletedAt: decided ? new Date(now - 5 * DAY_MS) : null,
            failureReason: seed.verification.failureReason ?? null,
            submittedAt: new Date(now - 12 * DAY_MS),
            decidedAt: decided ? new Date(now - 10 * DAY_MS) : null,
          },
          { transaction },
        );
      }
    }

    // Example sessions for the first user: one active, one logged out.
    const [firstUser] = SEED_USERS;
    if (firstUser) {
      await UserSession.bulkCreate(
        [
          {
            userId: firstUser.id,
            refreshTokenHash: fakeTokenHash('session-active'),
            userAgent: 'Mozilla/5.0 (Linux; Android 14) DevSeed',
            expiresAt: new Date(now + 29 * DAY_MS),
          },
          {
            userId: firstUser.id,
            refreshTokenHash: fakeTokenHash('session-logged-out'),
            userAgent: 'Mozilla/5.0 (Windows NT 10.0) DevSeed',
            expiresAt: new Date(now + 20 * DAY_MS),
            revokedAt: new Date(now - DAY_MS),
            revokedReason: 'logout',
          },
        ],
        { transaction, validate: true },
      );
    }
  });
};

export const down: MigrationFn<SeederContext> = async ({ context: { sequelize, env } }) => {
  if (env.APP_ENV === 'production') throw new Error('Development seeders never run in production');

  // Hard delete; profiles, preferences, sessions and verifications cascade.
  await sequelize.transaction(async (transaction) => {
    await User.destroy({ where: { id: SEED_USER_IDS }, force: true, transaction });
  });
};
