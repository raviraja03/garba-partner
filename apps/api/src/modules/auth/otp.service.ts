import { QueryTypes, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import { LIMITS } from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { hmacSha256Hex, randomNumericCode, timingSafeEqualHex } from '../../lib/crypto.js';
import { OtpRequest } from '../../models/index.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type OtpCheckResult =
  | { kind: 'valid' }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'expired' }
  | { kind: 'attempts_exceeded' }
  | { kind: 'no_active_code' };

export interface OtpService {
  /**
   * Enforces send limits, invalidates the previous code and stores a new one.
   * Returns the plaintext code, which must only be handed to the SMS provider (never logged).
   */
  issue(phoneHash: string, ipHash: string, transaction: Transaction): Promise<string>;
  /** Checks a code and records the attempt. Never throws for a wrong/expired code. */
  check(phoneHash: string, code: string, transaction: Transaction): Promise<OtpCheckResult>;
}

interface WindowStats {
  count: number;
  oldest: Date | null;
}

export function createOtpService(deps: {
  sequelize: Sequelize;
  env: Pick<ServerEnv, 'OTP_HMAC_SECRET'>;
}): OtpService {
  const { sequelize, env } = deps;

  const hashCode = (phoneHash: string, code: string) =>
    hmacSha256Hex(env.OTP_HMAC_SECRET, `otp:${phoneHash}:${code}`);

  async function windowStats(
    column: 'phone_hash' | 'ip_hash',
    value: string,
    since: Date,
    transaction: Transaction,
  ): Promise<WindowStats> {
    const [row] = await sequelize.query<{ count: number; oldest: Date | null }>(
      `SELECT count(*)::int AS count, min(created_at) AS oldest
         FROM otp_requests
        WHERE ${column} = :value AND created_at > :since`,
      { replacements: { value, since }, type: QueryTypes.SELECT, transaction },
    );
    return { count: row?.count ?? 0, oldest: row?.oldest ?? null };
  }

  /** Throws RATE_LIMITED (with Retry-After) when a window is full. */
  async function enforceWindow(
    column: 'phone_hash' | 'ip_hash',
    value: string,
    windowMs: number,
    max: number,
    now: Date,
    transaction: Transaction,
  ): Promise<void> {
    const stats = await windowStats(column, value, new Date(now.getTime() - windowMs), transaction);
    if (stats.count >= max) {
      const oldest = stats.oldest ?? now;
      throw new AppError('RATE_LIMITED', {
        message: 'Too many code requests. Please try again later.',
        retryAfterSeconds: (oldest.getTime() + windowMs - now.getTime()) / 1000,
      });
    }
  }

  return {
    async issue(phoneHash, ipHash, transaction) {
      // Serialise concurrent requests for the same phone so limits cannot be raced.
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))', {
        replacements: { key: `otp:${phoneHash}` },
        transaction,
      });
      const now = new Date();

      const latest = await OtpRequest.findOne({
        where: { phoneHash },
        order: [['createdAt', 'DESC']],
        transaction,
      });
      const cooldownEndsAt = latest
        ? latest.createdAt.getTime() + LIMITS.OTP_RESEND_COOLDOWN_SECONDS * 1000
        : 0;
      if (cooldownEndsAt > now.getTime()) {
        throw new AppError('RATE_LIMITED', {
          message: 'Please wait before requesting another code.',
          retryAfterSeconds: (cooldownEndsAt - now.getTime()) / 1000,
        });
      }

      await enforceWindow(
        'phone_hash',
        phoneHash,
        HOUR_MS,
        LIMITS.OTP_MAX_PER_PHONE_PER_HOUR,
        now,
        transaction,
      );
      await enforceWindow(
        'phone_hash',
        phoneHash,
        DAY_MS,
        LIMITS.OTP_MAX_PER_PHONE_PER_DAY,
        now,
        transaction,
      );
      await enforceWindow(
        'ip_hash',
        ipHash,
        HOUR_MS,
        LIMITS.OTP_MAX_PER_IP_PER_HOUR,
        now,
        transaction,
      );

      await OtpRequest.update(
        { invalidatedAt: now },
        { where: { phoneHash, consumedAt: null, invalidatedAt: null }, transaction },
      );

      const code = randomNumericCode(LIMITS.OTP_LENGTH);
      await OtpRequest.create(
        {
          phoneHash,
          otpHash: hashCode(phoneHash, code),
          expiresAt: new Date(now.getTime() + LIMITS.OTP_TTL_SECONDS * 1000),
          ipHash,
        },
        { transaction },
      );
      return code;
    },

    async check(phoneHash, code, transaction) {
      const now = new Date();
      const otp = await OtpRequest.findOne({
        where: { phoneHash, consumedAt: null, invalidatedAt: null },
        order: [['createdAt', 'DESC']],
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      if (!otp) return { kind: 'no_active_code' };

      if (otp.expiresAt.getTime() <= now.getTime()) {
        await otp.update({ invalidatedAt: now }, { transaction });
        return { kind: 'expired' };
      }
      if (otp.attempts >= LIMITS.OTP_MAX_ATTEMPTS) {
        await otp.update({ invalidatedAt: now }, { transaction });
        return { kind: 'attempts_exceeded' };
      }

      if (!timingSafeEqualHex(otp.otpHash, hashCode(phoneHash, code))) {
        const attempts = otp.attempts + 1;
        const exhausted = attempts >= LIMITS.OTP_MAX_ATTEMPTS;
        await otp.update(
          { attempts, ...(exhausted ? { invalidatedAt: now } : {}) },
          { transaction },
        );
        return exhausted
          ? { kind: 'attempts_exceeded' }
          : { kind: 'invalid', attemptsRemaining: LIMITS.OTP_MAX_ATTEMPTS - attempts };
      }

      await otp.update({ consumedAt: now }, { transaction });
      return { kind: 'valid' };
    },
  };
}
