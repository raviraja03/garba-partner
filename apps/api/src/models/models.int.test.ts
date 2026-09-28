import { randomBytes } from 'node:crypto';
import { BaseError, UniqueConstraintError } from 'sequelize';
import { describe, expect, it } from 'vitest';
import { encryptString, hashPhone } from '../lib/crypto.js';
import { hasTestDatabase, useTestDatabase } from '../test/helpers.js';
import { User, UserPreference, UserProfile, UserSession, UserVerification } from './index.js';

/**
 * Schema integration tests. They need a disposable database in TEST_DATABASE_URL
 * (see docs/database/database-setup.md) and are skipped when it is not configured.
 * The schema is rebuilt once per run (down → up) by src/test/global-setup.ts.
 */
const HASH_SECRET = 'integration-test-secret-at-least-32-characters';
const ENCRYPTION_KEY = randomBytes(32).toString('base64');
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
/** Reference data from 20260928100000-create-cities-and-areas. */
const AHMEDABAD = 'c1000000-0000-4000-8000-000000000001';
const VADODARA = 'c1000000-0000-4000-8000-000000000002';
const NAVRANGPURA_AHMEDABAD = 'a2000000-0001-4000-8000-000000000001';
const DAY_MS = 24 * 60 * 60 * 1000;

let phoneCounter = 100;

function newPhoneAttributes() {
  phoneCounter += 1;
  const phone = `+9199999${String(phoneCounter).padStart(5, '0')}`;
  return {
    phoneHash: hashPhone(phone, HASH_SECRET),
    phoneEncrypted: encryptString(phone, ENCRYPTION_KEY),
    phoneKeyVersion: 1,
  };
}

async function createUser(): Promise<User> {
  return User.create(newPhoneAttributes());
}

/** Resolves to the PostgreSQL SQLSTATE of a rejected Sequelize query. */
async function pgErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BaseError && 'parent' in error) {
      const parent = error.parent as { code?: string };
      return parent.code;
    }
    throw error;
  }
  return undefined;
}

describe.skipIf(!hasTestDatabase)('database schema (integration)', () => {
  const db = useTestDatabase();

  describe('users', () => {
    it('creates a user with profile and preferences in one transaction and loads associations', async () => {
      const userId = await db().transaction(async (transaction) => {
        const user = await User.create(newPhoneAttributes(), { transaction });
        await UserProfile.create(
          {
            userId: user.id,
            displayName: 'Test',
            dateOfBirth: '2000-01-01',
            gender: 'woman',
            garbaLevel: 'beginner',
            cityId: AHMEDABAD,
          },
          { transaction },
        );
        await UserPreference.create({ userId: user.id }, { transaction });
        return user.id;
      });

      const loaded = await User.findByPk(userId, { include: [UserProfile, UserPreference] });
      expect(loaded?.profile?.displayName).toBe('Test');
      expect(loaded?.status).toBe('active');
      // Privacy by default.
      expect(loaded?.preferences?.discoveryEnabled).toBe(false);
      expect(loaded?.preferences?.showArea).toBe(false);
    });

    it('hides phone columns by default and exposes them only through the withPhone scope', async () => {
      const { id } = await createUser();

      const plain = await User.findByPk(id);
      expect(plain?.get('phoneHash')).toBeUndefined();
      expect(plain?.get('phoneEncrypted')).toBeUndefined();

      const withPhone = await User.scope('withPhone').findByPk(id);
      expect(withPhone?.phoneHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('enforces a unique phone hash', async () => {
      const attributes = newPhoneAttributes();
      await User.create(attributes);

      await expect(User.create(attributes)).rejects.toBeInstanceOf(UniqueConstraintError);
    });

    it('rolls back the whole transaction when a later step fails', async () => {
      const attributes = newPhoneAttributes();

      await expect(
        db().transaction(async (transaction) => {
          const user = await User.create(attributes, { transaction });
          await db().query(
            `INSERT INTO user_profiles (user_id, display_name, date_of_birth, gender, garba_level, city_id)
             VALUES (:userId, 'X', '2000-01-01', 'robot', 'beginner', :cityId)`,
            { replacements: { userId: user.id, cityId: AHMEDABAD }, transaction },
          );
        }),
      ).rejects.toThrow();

      expect(await User.count()).toBe(0);
    });

    it('requires phone data to be erased together with a soft delete', async () => {
      const user = await User.scope('withPhone').create(newPhoneAttributes());

      // A plain soft delete keeps the phone data and is rejected by the database.
      expect(await pgErrorCode(user.destroy())).toBe(CHECK_VIOLATION);

      await user.update({
        phoneHash: null,
        phoneEncrypted: null,
        phoneKeyVersion: null,
        deletedAt: new Date(),
      });

      expect(await User.findByPk(user.id)).toBeNull();
      expect(await User.findByPk(user.id, { paranoid: false })).not.toBeNull();
    });

    it('rejects inconsistent hidden flags at the database level', async () => {
      const { id } = await createUser();

      const code = await pgErrorCode(
        db().query('UPDATE users SET hidden_from_discovery = true WHERE id = :id', {
          replacements: { id },
        }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('cascades a hard delete to all dependent rows', async () => {
      const user = await createUser();
      await UserProfile.create({
        userId: user.id,
        displayName: 'Test',
        dateOfBirth: '2000-01-01',
        gender: 'man',
        garbaLevel: 'advanced',
        cityId: AHMEDABAD,
      });
      await UserPreference.create({ userId: user.id });
      await UserSession.create({
        userId: user.id,
        refreshTokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + DAY_MS),
      });
      await UserVerification.create({
        userId: user.id,
        type: 'photo',
        provider: 'internal_review',
      });

      await db().query('DELETE FROM users WHERE id = :id', { replacements: { id: user.id } });

      expect(await UserProfile.count()).toBe(0);
      expect(await UserPreference.count()).toBe(0);
      expect(await UserSession.count()).toBe(0);
      expect(await UserVerification.count()).toBe(0);
    });
  });

  describe('user_profiles and user_preferences', () => {
    it('allows only one profile per user', async () => {
      const user = await createUser();
      const profile = {
        userId: user.id,
        displayName: 'Test',
        dateOfBirth: '2000-01-01',
        gender: 'woman' as const,
        garbaLevel: 'beginner' as const,
        cityId: AHMEDABAD,
      };
      await UserProfile.create(profile);

      await expect(UserProfile.create(profile)).rejects.toBeInstanceOf(UniqueConstraintError);
    });

    it('rejects an unknown garba level in the database even when model validation is bypassed', async () => {
      const user = await createUser();

      const code = await pgErrorCode(
        db().query(
          `INSERT INTO user_profiles (user_id, display_name, date_of_birth, gender, garba_level, city_id)
           VALUES (:userId, 'Test', '2000-01-01', 'woman', 'expert', :cityId)`,
          { replacements: { userId: user.id, cityId: AHMEDABAD } },
        ),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects an area that does not belong to the profile city (composite foreign key)', async () => {
      const user = await createUser();

      const code = await pgErrorCode(
        UserProfile.create({
          userId: user.id,
          displayName: 'Test',
          dateOfBirth: '2000-01-01',
          gender: 'woman',
          garbaLevel: 'beginner',
          cityId: VADODARA,
          areaId: NAVRANGPURA_AHMEDABAD,
        }),
      );
      expect(code).toBe(FOREIGN_KEY_VIOLATION);
    });

    it('rejects invalid Instagram handles and more than 30 available dates', async () => {
      const user = await createUser();
      const base = `INSERT INTO user_profiles (user_id, display_name, date_of_birth, gender, garba_level, city_id`;

      expect(
        await pgErrorCode(
          db().query(
            `${base}, instagram_handle) VALUES (:userId, 'T', '2000-01-01', 'man', 'beginner', :cityId, 'Bad Handle!')`,
            {
              replacements: { userId: user.id, cityId: AHMEDABAD },
            },
          ),
        ),
      ).toBe(CHECK_VIOLATION);

      const dates = Array.from(
        { length: 31 },
        (_, i) => `2030-01-${String((i % 28) + 1).padStart(2, '0')}`,
      );
      expect(
        await pgErrorCode(
          db().query(
            `${base}, available_dates) VALUES (:userId, 'T', '2000-01-01', 'man', 'beginner', :cityId, :dates::date[])`,
            {
              replacements: { userId: user.id, cityId: AHMEDABAD, dates: `{${dates.join(',')}}` },
            },
          ),
        ),
      ).toBe(CHECK_VIOLATION);
    });

    it('rejects an inverted or under-18 age range', async () => {
      const user = await createUser();

      await expect(
        UserPreference.create({ userId: user.id, ageMin: 40, ageMax: 30 }),
      ).rejects.toThrow(/ageMin/);
      const code = await pgErrorCode(
        db().query('INSERT INTO user_preferences (user_id, age_min) VALUES (:userId, 16)', {
          replacements: { userId: user.id },
        }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('user_sessions', () => {
    it('requires a reason whenever a session is revoked', async () => {
      const user = await createUser();

      const code = await pgErrorCode(
        db().query(
          `INSERT INTO user_sessions (user_id, refresh_token_hash, expires_at, revoked_at)
           VALUES (:userId, :hash, now() + interval '1 day', now())`,
          { replacements: { userId: user.id, hash: 'b'.repeat(64) } },
        ),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('user_verifications', () => {
    // Synthetic value that passes the Verhoeff checksum; NOT a real Aadhaar number.
    const AADHAAR_SHAPED = '2341 2341 2346';

    it('rejects Aadhaar-like numbers in the model and in the database', async () => {
      const user = await createUser();

      await expect(
        UserVerification.create({
          userId: user.id,
          type: 'photo',
          provider: 'internal_review',
          providerReference: AADHAAR_SHAPED,
        }),
      ).rejects.toThrow(/Identity document numbers/);

      const code = await pgErrorCode(
        db().query(
          `INSERT INTO user_verifications (user_id, type, provider, evidence_reference)
           VALUES (:userId, 'photo', 'internal_review', :ref)`,
          { replacements: { userId: user.id, ref: `docs/${AADHAAR_SHAPED}` } },
        ),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('accepts ordinary references such as UUID-based paths', async () => {
      const user = await createUser();

      const verification = await UserVerification.create({
        userId: user.id,
        type: 'photo',
        provider: 'internal_review',
        evidenceReference: `dev/verification/${user.id}/selfie`,
      });
      expect(verification.status).toBe('initiated');
    });

    it('allows only one open verification per type', async () => {
      const user = await createUser();
      await UserVerification.create({
        userId: user.id,
        type: 'photo',
        provider: 'internal_review',
      });

      await expect(
        UserVerification.create({ userId: user.id, type: 'photo', provider: 'internal_review' }),
      ).rejects.toBeInstanceOf(UniqueConstraintError);
    });

    it('refuses government ID checks until a licensed provider is approved', async () => {
      const user = await createUser();

      const code = await pgErrorCode(
        db().query(
          `INSERT INTO user_verifications (user_id, type, provider)
           VALUES (:userId, 'government_id', 'internal_review')`,
          { replacements: { userId: user.id } },
        ),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('requires a failure reason exactly when rejected', async () => {
      const user = await createUser();

      const code = await pgErrorCode(
        db().query(
          `INSERT INTO user_verifications (user_id, type, provider, status, decided_at)
           VALUES (:userId, 'photo', 'internal_review', 'rejected', now())`,
          { replacements: { userId: user.id } },
        ),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });
  });
});
