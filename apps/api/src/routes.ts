import { Router } from 'express';
import type { Logger } from 'pino';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import { CSRF_HEADER_VALUE } from '@garba-partner/shared';
import { createAuthenticateAdmin, createAuthenticateMember } from './middlewares/authenticate.js';
import { requireCsrfHeader } from './middlewares/csrf.js';
import { createAuthRateLimiters } from './middlewares/rate-limit.js';
import { createAdminAuthController } from './modules/admin/auth/admin-auth.controller.js';
import { createAdminAuthRouter } from './modules/admin/auth/admin-auth.routes.js';
import { createAdminAuthService } from './modules/admin/auth/admin-auth.service.js';
import { createMemberAuthController } from './modules/auth/auth.controller.js';
import { createMemberAuthRouter } from './modules/auth/auth.routes.js';
import { createMemberAuthService } from './modules/auth/auth.service.js';
import { createTokenService } from './modules/auth/token.service.js';
import type { HealthDependencies } from './modules/health/health.controller.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import type { SmsProvider } from './providers/sms/index.js';

/** External dependencies, injected so tests can supply their own (test database, fake SMS). */
export interface ApiDependencies extends HealthDependencies {
  sequelize: Sequelize;
  sms: SmsProvider;
}

/** Routes mounted under `/api/v1`. */
export function createApiRouter(options: {
  env: ServerEnv;
  logger: Logger;
  dependencies: ApiDependencies;
}): Router {
  const { env, logger, dependencies } = options;
  const { sequelize, sms } = dependencies;

  const tokens = createTokenService(env);
  const limiters = createAuthRateLimiters();
  const authenticateMember = createAuthenticateMember(tokens);
  const authenticateAdmin = createAuthenticateAdmin(tokens);

  const memberAuth = createMemberAuthService({ sequelize, env, sms, tokens, logger });
  const adminAuth = createAdminAuthService({ sequelize, env, tokens, logger });

  const router = Router();
  router.use('/health', createHealthRouter(dependencies));
  router.use(
    '/auth',
    createMemberAuthRouter({
      controller: createMemberAuthController(memberAuth, env),
      authenticateMember,
      csrf: requireCsrfHeader(CSRF_HEADER_VALUE.web, [env.WEB_ORIGIN]),
      limiters,
    }),
  );
  router.use(
    '/admin/auth',
    createAdminAuthRouter({
      controller: createAdminAuthController(adminAuth, env),
      authenticateAdmin,
      csrf: requireCsrfHeader(CSRF_HEADER_VALUE.admin, [env.ADMIN_ORIGIN]),
      limiters,
    }),
  );
  return router;
}
