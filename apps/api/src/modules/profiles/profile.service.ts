import type { Logger } from 'pino';
import { Op, QueryTypes, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  CURRENT_TERMS_VERSION,
  LIMITS,
  availableDatesError,
  calculateAge,
  todayInIndia,
  type CreateProfileData,
  type MyProfileDto,
  type PublicProfileDto,
  type UpdatePreferencesData,
  type UpdateProfileData,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { processProfileImage } from '../../lib/image.js';
import {
  Area,
  City,
  User,
  UserPreference,
  UserProfile,
  UserProfilePhoto,
  UserVerification,
} from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import { assertValidLocation } from '../locations/locations.service.js';
import { isBlockedEitherWay } from '../safety/sanctions.js';
import {
  computeCompletion,
  toOwnProfileDto,
  toPreferencesDto,
  toPublicProfileDto,
} from './profile.mapper.js';

export interface ProfileService {
  getMyProfile(userId: string): Promise<MyProfileDto>;
  createProfile(userId: string, input: CreateProfileData): Promise<MyProfileDto>;
  updateProfile(userId: string, input: UpdateProfileData): Promise<MyProfileDto>;
  updatePreferences(userId: string, input: UpdatePreferencesData): Promise<MyProfileDto>;
  uploadImage(userId: string, file: Buffer): Promise<MyProfileDto>;
  /**
   * Removes the main photo. A profile always keeps at least one photo: the oldest extra photo
   * becomes the main one, and when there is none the request is refused.
   */
  deleteImage(userId: string): Promise<MyProfileDto>;
  /** Adds an extra photo (the first photo of a profile becomes its main photo instead). */
  addPhoto(userId: string, file: Buffer): Promise<MyProfileDto>;
  deletePhoto(userId: string, photoId: string): Promise<MyProfileDto>;
  getPreview(userId: string): Promise<PublicProfileDto>;
  getPublicProfile(viewerId: string, targetUserId: string): Promise<PublicProfileDto>;
}

const PROFILE_INCLUDE = [
  { model: City, attributes: ['id', 'name', 'state'] },
  { model: Area, attributes: ['id', 'cityId', 'name'] },
];

function sortedDates(dates: readonly string[]): string[] {
  return [...new Set(dates)].sort();
}

function assertAvailableDates(dates: readonly string[] | undefined, today: string): void {
  if (dates === undefined) return;
  const error = availableDatesError(dates, today);
  if (error)
    throw new AppError('VALIDATION_ERROR', {
      details: [{ path: 'availableDates', message: error }],
    });
}

export function createProfileService(deps: {
  sequelize: Sequelize;
  media: MediaStorage;
  logger: Logger;
}): ProfileService {
  const { sequelize, media, logger } = deps;

  function loadProfile(userId: string, transaction?: Transaction) {
    return UserProfile.findOne({
      where: { userId },
      include: PROFILE_INCLUDE,
      ...(transaction ? { transaction } : {}),
    });
  }

  function loadPhotos(userId: string) {
    return UserProfilePhoto.findAll({ where: { userId }, order: [['createdAt', 'ASC']] });
  }

  async function buildMyProfile(userId: string, transaction?: Transaction): Promise<MyProfileDto> {
    const options = transaction ? { transaction } : {};
    const [user, profile, preferences, photos] = await Promise.all([
      User.findByPk(userId, {
        attributes: ['id', 'status', 'photoVerifiedAt', 'identityVerifiedAt'],
        ...options,
      }),
      loadProfile(userId, transaction),
      UserPreference.findOne({ where: { userId }, ...options }),
      UserProfilePhoto.findAll({ where: { userId }, order: [['createdAt', 'ASC']], ...options }),
    ]);
    if (!user) throw new AppError('UNAUTHENTICATED');

    const today = todayInIndia();
    const completion = computeCompletion(profile, today);
    return {
      profileStatus: completion.status,
      completion,
      accountStatus: user.status,
      photoVerified: user.photoVerifiedAt !== null,
      identityVerified: user.identityVerifiedAt !== null,
      profile: profile ? toOwnProfileDto(profile, media, today, photos) : null,
      preferences: toPreferencesDto(preferences),
    };
  }

  /** Marks onboarding complete the first time the profile becomes complete. */
  async function syncOnboarding(userId: string, transaction: Transaction): Promise<void> {
    const profile = await loadProfile(userId, transaction);
    if (computeCompletion(profile, todayInIndia()).status !== 'complete') return;
    await User.update(
      { onboardingCompletedAt: new Date() },
      { where: { id: userId, onboardingCompletedAt: null }, transaction },
    );
  }

  /** A new or removed photo means the "Photo verified" badge no longer applies. */
  async function revokePhotoVerification(userId: string, transaction: Transaction): Promise<void> {
    const [revokedUsers] = await User.update(
      { photoVerifiedAt: null },
      { where: { id: userId, photoVerifiedAt: { [Op.ne]: null } }, transaction },
    );
    if (revokedUsers > 0) {
      await UserVerification.update(
        { status: 'revoked' },
        { where: { userId, type: 'photo', status: 'approved' }, transaction },
      );
    }
  }

  async function destroyQuietly(publicId: string, reason: string): Promise<void> {
    try {
      await media.destroy(publicId);
    } catch (err) {
      // Logged with the opaque ID only; a cleanup job can retry orphaned assets.
      logger.error({ err, publicId, reason }, 'Failed to delete stored image');
    }
  }

  return {
    getMyProfile: (userId) => buildMyProfile(userId),

    async createProfile(userId, input) {
      const today = todayInIndia();
      assertAvailableDates(input.availableDates, today);

      // An under-18 attempt must be recorded even though the request fails, so the transaction
      // returns an outcome and the error is thrown after commit.
      const outcome = await sequelize.transaction(async (transaction) => {
        const user = await User.findByPk(userId, { lock: transaction.LOCK.UPDATE, transaction });
        if (!user) throw new AppError('UNAUTHENTICATED');
        if (user.underageRejectedAt) return 'underage' as const;
        if (await UserProfile.findOne({ where: { userId }, attributes: ['id'], transaction })) {
          throw new AppError('CONFLICT', { message: 'You already have a profile.' });
        }

        const age = calculateAge(input.dateOfBirth, today);
        if (age < LIMITS.MIN_AGE) {
          await user.update({ underageRejectedAt: new Date() }, { transaction });
          return 'underage' as const;
        }
        if (age > LIMITS.MAX_AGE) {
          throw new AppError('VALIDATION_ERROR', {
            details: [{ path: 'dateOfBirth', message: 'Please enter your real date of birth.' }],
          });
        }

        const areaId = input.areaId ?? null;
        await assertValidLocation(input.cityId, areaId, transaction);

        await UserProfile.create(
          {
            userId,
            displayName: input.name,
            dateOfBirth: input.dateOfBirth,
            gender: input.gender,
            cityId: input.cityId,
            areaId,
            bio: input.bio ?? null,
            instagramHandle: input.instagramId ?? null,
            garbaLevel: input.garbaLevel,
            availableDates: sortedDates(input.availableDates ?? []),
          },
          { transaction },
        );
        await UserPreference.findOrCreate({ where: { userId }, defaults: { userId }, transaction });
        await user.update(
          { termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() },
          { transaction },
        );
        await syncOnboarding(userId, transaction);
        return 'created' as const;
      });

      if (outcome === 'underage') throw new AppError('UNDERAGE');
      return buildMyProfile(userId);
    },

    async updateProfile(userId, input) {
      assertAvailableDates(input.availableDates, todayInIndia());

      await sequelize.transaction(async (transaction) => {
        const profile = await UserProfile.findOne({
          where: { userId },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!profile) throw new AppError('PROFILE_NOT_STARTED');

        const cityId = input.cityId ?? profile.cityId;
        // Changing the city clears the area unless a new area (of the new city) is given.
        const areaId =
          input.areaId !== undefined
            ? input.areaId
            : input.cityId !== undefined && input.cityId !== profile.cityId
              ? null
              : profile.areaId;
        if (input.cityId !== undefined || input.areaId !== undefined) {
          await assertValidLocation(cityId, areaId, transaction);
        }

        await profile.update(
          {
            ...(input.name !== undefined ? { displayName: input.name } : {}),
            ...(input.gender !== undefined ? { gender: input.gender } : {}),
            ...(input.garbaLevel !== undefined ? { garbaLevel: input.garbaLevel } : {}),
            ...(input.bio !== undefined ? { bio: input.bio } : {}),
            ...(input.instagramId !== undefined ? { instagramHandle: input.instagramId } : {}),
            ...(input.availableDates !== undefined
              ? { availableDates: sortedDates(input.availableDates) }
              : {}),
            cityId,
            areaId,
          },
          { transaction },
        );
        await syncOnboarding(userId, transaction);
      });
      return buildMyProfile(userId);
    },

    async updatePreferences(userId, input) {
      await sequelize.transaction(async (transaction) => {
        const preferences = await UserPreference.findOne({
          where: { userId },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!preferences) throw new AppError('PROFILE_NOT_STARTED');

        const minAge = input.minAge ?? preferences.ageMin;
        const maxAge = input.maxAge ?? preferences.ageMax;
        if (minAge > maxAge) {
          throw new AppError('VALIDATION_ERROR', {
            details: [
              { path: 'minAge', message: 'Minimum age cannot be greater than maximum age.' },
            ],
          });
        }
        await preferences.update(
          {
            ...(input.preferredGender !== undefined
              ? { partnerGenderPreference: input.preferredGender }
              : {}),
            ...(input.verifiedOnly !== undefined ? { verifiedOnly: input.verifiedOnly } : {}),
            ...(input.discoveryEnabled !== undefined
              ? { discoveryEnabled: input.discoveryEnabled }
              : {}),
            ...(input.showArea !== undefined ? { showArea: input.showArea } : {}),
            ageMin: minAge,
            ageMax: maxAge,
          },
          { transaction },
        );
      });
      return buildMyProfile(userId);
    },

    async uploadImage(userId, file) {
      if (!(await UserProfile.findOne({ where: { userId }, attributes: ['id'] }))) {
        throw new AppError('PROFILE_NOT_STARTED');
      }
      const image = await processProfileImage(file);

      let stored;
      try {
        stored = await media.upload(image, 'profile-images');
      } catch (err) {
        logger.error({ err, storage: media.name }, 'Profile image upload failed');
        throw new AppError('SERVICE_UNAVAILABLE', {
          message: 'We could not save your photo. Please try again.',
        });
      }

      let previousPublicId: string | null = null;
      try {
        await sequelize.transaction(async (transaction) => {
          const profile = await UserProfile.findOne({
            where: { userId },
            lock: transaction.LOCK.UPDATE,
            transaction,
          });
          if (!profile) throw new AppError('PROFILE_NOT_STARTED');
          previousPublicId = profile.imagePublicId;
          await profile.update(
            {
              imagePublicId: stored.publicId,
              imageWidth: stored.width,
              imageHeight: stored.height,
              imageUploadedAt: new Date(),
            },
            { transaction },
          );
          await revokePhotoVerification(userId, transaction);
          await syncOnboarding(userId, transaction);
        });
      } catch (error) {
        await destroyQuietly(stored.publicId, 'rollback');
        throw error;
      }

      if (previousPublicId) await destroyQuietly(previousPublicId, 'replaced');
      return buildMyProfile(userId);
    },

    async deleteImage(userId) {
      let previousPublicId: string | null = null;
      await sequelize.transaction(async (transaction) => {
        const profile = await UserProfile.findOne({
          where: { userId },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!profile) throw new AppError('PROFILE_NOT_STARTED');
        previousPublicId = profile.imagePublicId;
        if (!previousPublicId) return;
        // A profile needs a photo: the oldest extra photo takes the main photo's place.
        const next = await UserProfilePhoto.findOne({
          where: { userId },
          order: [['createdAt', 'ASC']],
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!next) {
          throw new AppError('VALIDATION_ERROR', {
            message:
              'Your profile needs at least one photo. Upload a new photo to replace this one.',
          });
        }
        await profile.update(
          {
            imagePublicId: next.publicId,
            imageWidth: next.width,
            imageHeight: next.height,
            imageUploadedAt: new Date(),
          },
          { transaction },
        );
        await next.destroy({ transaction });
        await revokePhotoVerification(userId, transaction);
      });
      if (previousPublicId) await destroyQuietly(previousPublicId, 'deleted');
      return buildMyProfile(userId);
    },

    async addPhoto(userId, file) {
      const existing = await UserProfile.findOne({
        where: { userId },
        attributes: ['id', 'imagePublicId'],
      });
      if (!existing) throw new AppError('PROFILE_NOT_STARTED');
      // The first photo of a profile is its main photo.
      if (!existing.imagePublicId) return this.uploadImage(userId, file);

      const tooMany = () =>
        new AppError('VALIDATION_ERROR', {
          message: `You can add up to ${String(LIMITS.PROFILE_EXTRA_PHOTOS_MAX)} extra photos. Remove one first.`,
        });
      // Checked before the upload to save the work, and again under the lock below.
      if (
        (await UserProfilePhoto.count({ where: { userId } })) >= LIMITS.PROFILE_EXTRA_PHOTOS_MAX
      ) {
        throw tooMany();
      }
      const image = await processProfileImage(file);

      let stored;
      try {
        stored = await media.upload(image, 'profile-images');
      } catch (err) {
        logger.error({ err, storage: media.name }, 'Profile photo upload failed');
        throw new AppError('SERVICE_UNAVAILABLE', {
          message: 'We could not save your photo. Please try again.',
        });
      }

      try {
        await sequelize.transaction(async (transaction) => {
          // The profile row is the lock that serialises a member's photo changes.
          const profile = await UserProfile.findOne({
            where: { userId },
            lock: transaction.LOCK.UPDATE,
            transaction,
          });
          if (!profile) throw new AppError('PROFILE_NOT_STARTED');
          const count = await UserProfilePhoto.count({ where: { userId }, transaction });
          if (count >= LIMITS.PROFILE_EXTRA_PHOTOS_MAX) throw tooMany();
          await UserProfilePhoto.create(
            { userId, publicId: stored.publicId, width: stored.width, height: stored.height },
            { transaction },
          );
        });
      } catch (error) {
        await destroyQuietly(stored.publicId, 'rollback');
        throw error;
      }
      return buildMyProfile(userId);
    },

    async deletePhoto(userId, photoId) {
      // Scoped to the owner: another member's photo ID is simply not found.
      const photo = await UserProfilePhoto.findOne({ where: { id: photoId, userId } });
      if (!photo) throw new AppError('NOT_FOUND', { message: 'Photo not found.' });
      await photo.destroy();
      await destroyQuietly(photo.publicId, 'deleted');
      return buildMyProfile(userId);
    },

    async getPreview(userId) {
      const [user, profile, preferences, photos] = await Promise.all([
        User.findByPk(userId, { attributes: ['id', 'photoVerifiedAt', 'identityVerifiedAt'] }),
        loadProfile(userId),
        UserPreference.findOne({ where: { userId } }),
        loadPhotos(userId),
      ]);
      if (!user) throw new AppError('UNAUTHENTICATED');
      if (!profile) throw new AppError('PROFILE_NOT_STARTED');
      return toPublicProfileDto(user, profile, preferences, media, todayInIndia(), photos);
    },

    async getPublicProfile(viewerId, targetUserId) {
      const today = todayInIndia();
      const notFound = () => new AppError('NOT_FOUND', { message: 'Profile not found.' });
      // Soft-deleted users are excluded by the paranoid default scope.
      const user = await User.findOne({
        where: { id: targetUserId, status: 'active' },
        attributes: ['id', 'photoVerifiedAt', 'identityVerifiedAt', 'hiddenFromDiscovery'],
      });
      const profile = user ? await loadProfile(user.id) : null;
      // Unknown, inactive, incomplete and blocked (either direction) profiles all look the
      // same: 404, so a block is never revealed.
      if (
        !user ||
        !profile ||
        computeCompletion(profile, today).status !== 'complete' ||
        (await isBlockedEitherWay(viewerId, targetUserId))
      ) {
        throw notFound();
      }
      const preferences = await UserPreference.findOne({ where: { userId: user.id } });
      if (viewerId !== targetUserId) {
        // Same visibility as discovery (QA finding: this endpoint used to bypass it). Members who
        // are connected (active match or pending interest) can always see each other; anyone
        // else only sees members who are discoverable. A report either way hides the profile.
        const [relation] = await sequelize.query<{ connected: boolean; reported: boolean }>(
          `SELECT
             EXISTS (SELECT 1 FROM matches m WHERE m.status = 'active'
                       AND ((m.user_a_id = :viewer AND m.user_b_id = :target)
                         OR (m.user_a_id = :target AND m.user_b_id = :viewer)))
             OR EXISTS (SELECT 1 FROM partner_interests i WHERE i.status = 'pending'
                       AND ((i.sender_id = :viewer AND i.receiver_id = :target)
                         OR (i.sender_id = :target AND i.receiver_id = :viewer))) AS connected,
             EXISTS (SELECT 1 FROM reports r
                      WHERE (r.reporter_id = :viewer AND r.reported_user_id = :target)
                         OR (r.reporter_id = :target AND r.reported_user_id = :viewer)) AS reported`,
          { type: QueryTypes.SELECT, replacements: { viewer: viewerId, target: targetUserId } },
        );
        if (relation?.reported) throw notFound();
        const discoverable = !user.hiddenFromDiscovery && preferences?.discoveryEnabled === true;
        if (!relation?.connected && !discoverable) throw notFound();
      }
      return toPublicProfileDto(
        user,
        profile,
        preferences,
        media,
        today,
        await loadPhotos(user.id),
      );
    },
  };
}
