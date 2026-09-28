import { parseArgs } from 'node:util';
import { ADMIN_ROLES, type AdminRole } from '@garba-partner/shared';
import { createSequelize, databaseConfigFromEnv } from '../config/database.js';
import { readEnv } from '../config/env.js';
import { randomToken } from '../lib/crypto.js';
import { hashPassword } from '../lib/passwords.js';
import { AdminUser } from '../models/index.js';

/**
 * Creates an admin account (works in every environment, including production bootstrap):
 *
 *   npm run admin:create -- --email ops@example.com --name "Ops Lead" --role super_admin
 *
 * A strong random password is generated and printed ONCE to this terminal; it is never logged
 * or stored in plaintext. Hand it over securely.
 */
function isAdminRole(value: string | undefined): value is AdminRole {
  return value !== undefined && (ADMIN_ROLES as readonly string[]).includes(value);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!email || !name || !isAdminRole(values.role)) {
    throw new Error(
      `Usage: admin:create -- --email <email> --name <name> --role <${ADMIN_ROLES.join('|')}>`,
    );
  }

  const env = readEnv();
  const sequelize = createSequelize({
    ...databaseConfigFromEnv(env),
    url: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
    poolMax: 1,
  });

  try {
    const password = randomToken(18); // 24 URL-safe characters, 144 bits of entropy
    await AdminUser.create({
      email,
      name,
      role: values.role,
      passwordHash: await hashPassword(password),
    });
    process.stdout.write(
      `Created ${values.role} ${email}.\nTemporary password (shown once, store it securely): ${password}\n`,
    );
  } finally {
    await sequelize.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`admin:create: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
