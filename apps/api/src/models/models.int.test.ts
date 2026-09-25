import { randomBytes } from 'node:crypto';
import { pino } from 'pino';
import { BaseError, UniqueConstraintError } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSequelize } from '../config/database.js';
import { createMigrator } from '../config/umzug.js';
import { encryptString, hashPhone } from '../lib/crypto.js';
import { User, UserPreference, UserProfile, UserSession, UserVerification } from './index.js';

/**
 * Schema integration tests. They need a disposable database in TEST_DATABASE_URL
 * (see docs/database/database-setup.md) and are skipped when it is not configured.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
const HASH_SECRET = 'integration-test-secret-at-least-32-characters';
const ENCRYPTION_KEY = randomBytes(32).toString('base64');
const CHECK_VIOLATION = '23514';
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

describe.skipIf(!TEST_DATABASE_URL)('database schema (integration)', () => {
  let sequelize: Sequelize;

  beforeAll(async () => {
    sequelize = createSequelize({ url: TEST_DATABASE_URL, ssl: false, poolMax: 2 });
    const migrator = createMigrator(sequelize, pino({ level: 'silent' }));
    // Exercise both directions of every migration, ending on a fresh schema.
    await migrator.up();
    await migrator.down({ to: 0 });
    await migrator.up();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('TRUNCATE users CASCADE');
  });

  describe('users', () => {
    it('creates a user with profile and preferences in one transaction and loads associations', async () => {
      const userId = await sequelize.transaction(async (transaction) => {
        const user = await User.create(newPhoneAttributes(), { transaction });
        await UserProfile.create(
          {
            userId: user.id,
            displayName: 'Test',
            dateOfBirth: '2000-01-01',
            gender: 'woman',
            experience: 'beginner',
            styles: ['garba'],
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
        sequelize.transaction(async (transaction) => {
          const user = await User.create(attributes, { transaction });
          await sequelize.query(
            `INSERT INTO user_profiles (user_id, display_name, date_of_birth, gender, experience, styles)
             VALUES (:userId, 'X', '2000-01-01', 'robot', 'beginner', ARRAY['garba'])`,
            { replacements: { userId: user.id }, transaction },
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
        sequelize.query('UPDATE users SET hidden_from_discovery = true WHERE id = :id', {
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
        experience: 'advanced',
        styles: ['garba', 'dandiya_raas'],
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

      await sequelize.query('DELETE FROM users WHERE id = :id', { replacements: { id: user.id } });

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
        experience: 'beginner' as const,
        styles: ['garba' as const],
      };
      await UserProfile.create(profile);

      await expect(UserProfile.create(profile)).rejects.toBeInstanceOf(UniqueConstraintError);
    });

    it('rejects unknown dance styles in the database even when model validation is bypassed', async () => {
      const user = await createUser();

      const code = await pgErrorCode(
        sequelize.query(
          `INSERT INTO user_profiles (user_id, display_name, date_of_birth, gender, experience, styles)
           VALUES (:userId, 'Test', '2000-01-01', 'woman', 'beginner', ARRAY['salsa'])`,
          { replacements: { userId: user.id } },
        ),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects an inverted or under-18 age range', async () => {
      const user = await createUser();

      await expect(
        UserPreference.create({ userId: user.id, ageMin: 40, ageMax: 30 }),
      ).rejects.toThrow(/ageMin/);
      const code = await pgErrorCode(
        sequelize.query('INSERT INTO user_preferences (user_id, age_min) VALUES (:userId, 16)', {
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
        sequelize.query(
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
        sequelize.query(
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
        sequelize.query(
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
        sequelize.query(
          `INSERT INTO user_verifications (user_id, type, provider, status, decided_at)
           VALUES (:userId, 'photo', 'internal_review', 'rejected', now())`,
          { replacements: { userId: user.id } },
        ),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });
  });
});
