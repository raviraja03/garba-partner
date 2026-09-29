import { Router } from 'express';
import type { Logger } from 'pino';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import { CSRF_HEADER_VALUE, LIMITS } from '@garba-partner/shared';
import { createAuthenticateAdmin, createAuthenticateMember } from './middlewares/authenticate.js';
import { requireCsrfHeader } from './middlewares/csrf.js';
import {
  createAuthRateLimiters,
  createIpRateLimiter,
  createMemberRateLimiter,
} from './middlewares/rate-limit.js';
import { createAdminAuthController } from './modules/admin/auth/admin-auth.controller.js';
import { createAdminAuthRouter } from './modules/admin/auth/admin-auth.routes.js';
import { createAdminAuthService } from './modules/admin/auth/admin-auth.service.js';
import { createAdminEventsRouter } from './modules/admin/events/admin-events.routes.js';
import { createAdminEventsService } from './modules/admin/events/admin-events.service.js';
import { createAdminOrganizersRouter } from './modules/admin/organizers/admin-organizers.routes.js';
import { createAdminOrganizersService } from './modules/admin/organizers/admin-organizers.service.js';
import { createAdminUsersRouter } from './modules/admin/users/admin-users.routes.js';
import { createAdminUsersService } from './modules/admin/users/admin-users.service.js';
import { createMemberAuthController } from './modules/auth/auth.controller.js';
import { createMemberAuthRouter } from './modules/auth/auth.routes.js';
import { createMemberAuthService } from './modules/auth/auth.service.js';
import { createTokenService } from './modules/auth/token.service.js';
import { createDiscoveryRouter } from './modules/discovery/discovery.routes.js';
import { createDiscoveryService } from './modules/discovery/discovery.service.js';
import {
  createAttendanceRouter,
  createMyAttendanceRouter,
} from './modules/events/attendance.routes.js';
import { createAttendanceService } from './modules/events/attendance.service.js';
import { createEventsRouter } from './modules/events/events.routes.js';
import { createEventsService } from './modules/events/events.service.js';
import type { HealthDependencies } from './modules/health/health.controller.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createLocationsRouter } from './modules/locations/locations.routes.js';
import { createProfileController } from './modules/profiles/profile.controller.js';
import {
  createMyProfileRouter,
  createPublicProfileRouter,
} from './modules/profiles/profile.routes.js';
import { createProfileService } from './modules/profiles/profile.service.js';
import { createBlocksService } from './modules/safety/blocks.service.js';
import { createReportsService } from './modules/safety/reports.service.js';
import { createSafetyLogger } from './modules/safety/safety-log.service.js';
import { createSafetyRouters } from './modules/safety/safety.routes.js';
import type { MediaStorage } from './providers/media/index.js';
import type { SmsProvider } from './providers/sms/index.js';

/** External dependencies, injected so tests can supply their own (test database, fake SMS). */
export interface ApiDependencies extends HealthDependencies {
  sequelize: Sequelize;
  sms: SmsProvider;
  media: MediaStorage;
}

/** Routes mounted under `/api/v1`. */
export function createApiRouter(options: {
  env: ServerEnv;
  logger: Logger;
  dependencies: ApiDependencies;
}): Router {
  const { env, logger, dependencies } = options;
  const { sequelize, sms, media } = dependencies;

  const tokens = createTokenService(env);
  const limiters = createAuthRateLimiters();
  const authenticateMember = createAuthenticateMember(tokens);
  const authenticateAdmin = createAuthenticateAdmin(tokens);

  const memberAuth = createMemberAuthService({ sequelize, env, sms, tokens, logger });
  const adminAuth = createAdminAuthService({ sequelize, env, tokens, logger });
  const profileController = createProfileController(
    createProfileService({ sequelize, media, logger }),
  );

  const router = Router();
  router.use('/health', createHealthRouter(dependencies));
  router.use('/cities', createLocationsRouter());
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
  router.use(
    '/me',
    createMyProfileRouter({
      controller: profileController,
      authenticateMember,
      uploadLimiter: createMemberRateLimiter({
        windowMs: 60 * 60 * 1000,
        limit: LIMITS.PROFILE_IMAGE_UPLOADS_PER_HOUR,
      }),
    }),
  );
  router.use(
    '/users',
    createPublicProfileRouter({ controller: profileController, authenticateMember }),
  );
  router.use(
    '/admin/users',
    createAdminUsersRouter({
      service: createAdminUsersService({ sequelize, env, media }),
      authenticateAdmin,
    }),
  );
  const attendance = createAttendanceService();
  const HOUR_MS = 60 * 60 * 1000;
  // Member-only attendance routes are mounted before the public event router.
  router.use(
    '/events',
    createAttendanceRouter({
      service: attendance,
      authenticateMember,
      limiter: createMemberRateLimiter({
        windowMs: HOUR_MS,
        limit: LIMITS.ATTENDANCE_CHANGES_PER_HOUR,
      }),
    }),
  );
  router.use('/me', createMyAttendanceRouter({ service: attendance, authenticateMember }));
  router.use(
    '/partners',
    createDiscoveryRouter({
      service: createDiscoveryService({ sequelize, media }),
      authenticateMember,
      limiter: createMemberRateLimiter({
        windowMs: 60 * 1000,
        limit: LIMITS.DISCOVERY_REQUESTS_PER_MINUTE,
      }),
    }),
  );

  // Blocking and reporting (docs/safety): required before any member-to-member feature.
  const safetyLog = createSafetyLogger({ ipHashSecret: env.OTP_HMAC_SECRET, logger });
  const safety = createSafetyRouters({
    blocks: createBlocksService({ sequelize, media, safetyLog }),
    reports: createReportsService({ sequelize, safetyLog }),
    authenticateMember,
    blockLimiter: createMemberRateLimiter({ windowMs: HOUR_MS, limit: LIMITS.BLOCKS_PER_HOUR }),
    reportLimiter: createMemberRateLimiter({
      windowMs: HOUR_MS,
      limit: LIMITS.REPORTS_PER_DAY,
    }),
  });
  router.use('/blocks', safety.blocks);
  router.use('/reports', safety.reports);

  router.use(
    '/events',
    createEventsRouter({
      service: createEventsService({ media }),
      limiter: createIpRateLimiter({
        windowMs: 60 * 1000,
        limit: LIMITS.PUBLIC_EVENT_REQUESTS_PER_MINUTE,
      }),
    }),
  );
  router.use(
    '/admin/events',
    createAdminEventsRouter({
      service: createAdminEventsService({ sequelize, env, media, logger }),
      authenticateAdmin,
    }),
  );
  router.use(
    '/admin/organizers',
    createAdminOrganizersRouter({
      service: createAdminOrganizersService({ sequelize, env }),
      authenticateAdmin,
    }),
  );
  return router;
}
