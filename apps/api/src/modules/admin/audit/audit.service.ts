import type { Transaction } from 'sequelize';
import { hmacSha256Hex } from '../../../lib/crypto.js';
import { AdminAuditLog, type AuditTargetType } from '../../../models/index.js';

export interface AuditEntry {
  adminId: string;
  /** Dotted action name, e.g. `user.suspend`. */
  action: string;
  targetType: AuditTargetType;
  targetId: string | null;
  /** Reasons and before/after values. NEVER phone numbers, OTPs, passwords or tokens. */
  metadata?: Record<string, unknown>;
  ip: string;
}

/**
 * Records an admin action. Must be called inside the SAME transaction as the change it
 * describes, so the change and its audit entry commit (or roll back) together.
 */
export async function recordAdminAction(
  entry: AuditEntry,
  ipHashSecret: string,
  transaction: Transaction,
): Promise<void> {
  await AdminAuditLog.create(
    {
      adminId: entry.adminId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
      ipHash: hmacSha256Hex(ipHashSecret, `ip:${entry.ip}`),
    },
    { transaction },
  );
}
