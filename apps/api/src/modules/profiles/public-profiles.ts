import type { PublicProfileDto } from '@garba-partner/shared';
import { Area, City, User, UserPreference, UserProfile } from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import { toPublicProfileDto } from './profile.mapper.js';

/**
 * Loads PUBLIC profiles (allow-list DTO) for several members in three queries. Callers are
 * responsible for deciding who may be shown; members without a profile are simply absent.
 */
export async function loadPublicProfiles(
  userIds: readonly string[],
  media: MediaStorage,
  today: string,
): Promise<Map<string, PublicProfileDto>> {
  const result = new Map<string, PublicProfileDto>();
  if (userIds.length === 0) return result;
  const ids = [...new Set(userIds)];
  const [users, profiles, preferences] = await Promise.all([
    User.findAll({
      where: { id: ids },
      attributes: ['id', 'photoVerifiedAt', 'identityVerifiedAt'],
    }),
    UserProfile.findAll({
      where: { userId: ids },
      include: [
        { model: City, attributes: ['id', 'name'] },
        { model: Area, attributes: ['id', 'name'] },
      ],
    }),
    UserPreference.findAll({ where: { userId: ids }, attributes: ['userId', 'showArea'] }),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const preferenceById = new Map(preferences.map((pref) => [pref.userId, pref]));
  for (const profile of profiles) {
    const user = userById.get(profile.userId);
    if (!user) continue;
    result.set(
      profile.userId,
      toPublicProfileDto(user, profile, preferenceById.get(profile.userId), media, today),
    );
  }
  return result;
}
