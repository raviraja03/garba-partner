import type { MigrationFn } from 'umzug';
import type { AdminRole } from '@garba-partner/shared';
import type { SeederContext } from '../config/umzug.js';
import { hashPassword } from '../lib/passwords.js';
import { AdminUser } from '../models/index.js';

/**
 * Local development admins, one per role. The shared password is documented in
 * docs/auth/authentication.md and ONLY works on a development database: this seeder refuses to
 * run unless APP_ENV=development. Real admins are created with `npm run admin:create`.
 */
export const DEV_ADMIN_PASSWORD = 'garba-dev-admin-2026';

const DEV_ADMINS: readonly { id: string; email: string; name: string; role: AdminRole }[] = [
  {
    id: 'b2e0d4ef-0001-4000-8000-000000000001',
    email: 'superadmin@garbapartner.test',
    name: 'Dev Super Admin',
    role: 'super_admin',
  },
  {
    id: 'b2e0d4ef-0002-4000-8000-000000000002',
    email: 'moderator@garbapartner.test',
    name: 'Dev Moderator',
    role: 'moderator',
  },
  {
    id: 'b2e0d4ef-0003-4000-8000-000000000003',
    email: 'events@garbapartner.test',
    name: 'Dev Event Manager',
    role: 'event_manager',
  },
];

export const up: MigrationFn<SeederContext> = async ({ context: { sequelize, env } }) => {
  if (env.APP_ENV !== 'development') {
    throw new Error('Development seeders only run when APP_ENV=development');
  }

  const passwordHash = await hashPassword(DEV_ADMIN_PASSWORD);
  await sequelize.transaction(async (transaction) => {
    for (const admin of DEV_ADMINS) {
      await AdminUser.create({ ...admin, passwordHash }, { transaction });
    }
  });
};

export const down: MigrationFn<SeederContext> = async ({ context: { sequelize, env } }) => {
  if (env.APP_ENV !== 'development') {
    throw new Error('Development seeders only run when APP_ENV=development');
  }

  await sequelize.transaction(async (transaction) => {
    await AdminUser.destroy({ where: { id: DEV_ADMINS.map((admin) => admin.id) }, transaction });
  });
};
