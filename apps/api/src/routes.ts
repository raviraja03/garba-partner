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
import type { ApiLogSink } from './modules/api-logs/api-log.store.js';
import { createChannelNotifier } from './modules/notifications/channel-notifier.js';
import { createAdminAuthRouter } from './modules/admin/auth/admin-auth.routes.js';
import { createAdminAuthService } from './modules/admin/auth/admin-auth.service.js';
import { createAdminDashboardRouter } from './modules/admin/dashboard/admin-dashboard.routes.js';
import { createAdminDashboardService } from './modules/admin/dashboard/admin-dashboard.service.js';
import { createAdminEventsRouter } from './modules/admin/events/admin-events.routes.js';
import { createAdminLogsRouter } from './modules/admin/log-viewer/admin-logs.routes.js';
import { createAdminLogsService } from './modules/admin/log-viewer/admin-logs.service.js';
import { createAdminMatchesRouter } from './modules/admin/matches/admin-matches.routes.js';
import { createAdminNotificationsRouter } from './modules/admin/notifications/admin-notifications.routes.js';
import { createAdminNotificationsService } from './modules/admin/notifications/admin-notifications.service.js';
import { createAdminMatchesService } from './modules/admin/matches/admin-matches.service.js';
import { createAdminPaymentsRouter } from './modules/admin/payments/admin-payments.routes.js';
import { createAdminPaymentsService } from './modules/admin/payments/admin-payments.service.js';
import { createAdminReportsRouter } from './modules/admin/reports/admin-reports.routes.js';
import { createAdminReportsService } from './modules/admin/reports/admin-reports.service.js';
import { createAdminEventsService } from './modules/admin/events/admin-events.service.js';
import { createAdminOrganizersRouter } from './modules/admin/organizers/admin-organizers.routes.js';
import { createAdminOrganizersService } from './modules/admin/organizers/admin-organizers.service.js';
import { createAdminUsersRouter } from './modules/admin/users/admin-users.routes.js';
import { createAdminUsersService } from './modules/admin/users/admin-users.service.js';
import { createMemberAuthController } from './modules/auth/auth.controller.js';
import { createMemberAuthRouter } from './modules/auth/auth.routes.js';
import { createMemberAuthService } from './modules/auth/auth.service.js';
import { createTokenService } from './modules/auth/token.service.js';
import { createChatRouter } from './modules/chat/chat.routes.js';
import { createChatService } from './modules/chat/chat.service.js';
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
import {
  createInterestsRouter,
  createMatchesRouter,
} from './modules/interests/interests.routes.js';
import { createInterestsService } from './modules/interests/interests.service.js';
import { createMatchesService } from './modules/interests/matches.service.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createNotificationsRouter } from './modules/notifications/notifications.routes.js';
import {
  createNotificationsService,
  createNotifier,
} from './modules/notifications/notifications.service.js';
import { createLocationsRouter } from './modules/locations/locations.routes.js';
import {
  createBookingsRouter,
  createOrdersRouter,
  createPaymentWebhookRouter,
} from './modules/payments/payments.routes.js';
import { createPaymentsService } from './modules/payments/payments.service.js';
import { createProfileController } from './modules/profiles/profile.controller.js';
import {
  createMyProfileRouter,
  createPublicProfileRouter,
} from './modules/profiles/profile.routes.js';
import { createProfileService } from './modules/profiles/profile.service.js';
import { createBlocksService } from './modules/safety/blocks.service.js';
import { createMemberSafetyService } from './modules/safety/member-safety.service.js';
import { createReportsService } from './modules/safety/reports.service.js';
import { createSafetyLogger } from './modules/safety/safety-log.service.js';
import { createMySafetyRouter, createSafetyRouters } from './modules/safety/safety.routes.js';
import { createSuspiciousActivityDetector } from './modules/safety/suspicious-activity.service.js';
import type { MediaStorage } from './providers/media/index.js';
import type { PaymentGateway } from './providers/payments/index.js';
import type { RealtimeHub } from './realtime/hub.js';
import type { MessageProviders } from './providers/messaging/index.js';
import type { SmsProvider } from './providers/sms/index.js';

/** External dependencies, injected so tests can supply their own (test database, fake SMS). */
export interface ApiDependencies extends HealthDependencies {
  sequelize: Sequelize;
  sms: SmsProvider;
  /** SMS / WhatsApp notification channels. Omitted or `null` per channel = switched off. */
  messaging?: MessageProviders;
  /** Receives one entry per finished request for the `api_logs` table. Omitted = not stored. */
  apiLogs?: ApiLogSink;
  media: MediaStorage;
  /** Socket.IO seam: emits and disconnects (no-ops until a socket server is attached). */
  realtime: RealtimeHub;
  /** Razorpay (docs/payments/razorpay.md); null when online pass sales are disabled. */
  payments: PaymentGateway | null;
}

/** Routes mounted under `/api/v1`. */
export function createApiRouter(options: {
  env: ServerEnv;
  logger: Logger;
  dependencies: ApiDependencies;
}): Router {
  const { env, logger, dependencies } = options;
  const { sequelize, sms, media, realtime: hub } = dependencies;

  const tokens = createTokenService(env);
  const limiters = createAuthRateLimiters();
  const authenticateMember = createAuthenticateMember(tokens);
  const authenticateAdmin = createAuthenticateAdmin(tokens);

  const memberAuth = createMemberAuthService({ sequelize, env, sms, tokens, logger });
  const adminAuth = createAdminAuthService({ sequelize, env, tokens, logger });
  const profileController = createProfileController(
    createProfileService({ sequelize, media, logger }),
  );

  // In-app notifications (docs/notifications/notifications.md): created after commits, never fatal.
  const channels = dependencies.messaging
    ? createChannelNotifier({ sequelize, env, providers: dependencies.messaging, logger })
    : null;
  const notifier = createNotifier({ sequelize, media, hub, logger, channels });

  const router = Router();
  // Global per-IP ceiling (on top of the per-endpoint limits). Signed Razorpay webhooks are
  // exempt: they come from Razorpay's servers and are verified by signature.
  const globalLimiter = createIpRateLimiter({
    windowMs: 60 * 1000,
    limit: LIMITS.API_REQUESTS_PER_MINUTE,
  });
  router.use((req, res, next) => {
    if (req.path.startsWith('/webhooks/')) {
      next();
      return;
    }
    void globalLimiter(req, res, next);
  });
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
      service: createAdminUsersService({ sequelize, env, media, hub, notifier }),
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
  const discovery = createDiscoveryService({ sequelize, media });
  router.use(
    '/partners',
    createDiscoveryRouter({
      service: discovery,
      authenticateMember,
      limiter: createMemberRateLimiter({
        windowMs: 60 * 1000,
        limit: LIMITS.DISCOVERY_REQUESTS_PER_MINUTE,
      }),
    }),
  );

  // Blocking and reporting (docs/safety): required before any member-to-member feature.
  const safetyLog = createSafetyLogger({ ipHashSecret: env.OTP_HMAC_SECRET, logger });
  // Automated flags for moderators; never sanctions anyone (docs/safety/abuse-prevention.md).
  const suspicious = createSuspiciousActivityDetector({ sequelize, safetyLog, logger });

  // Interests and matches (docs/matching/interests.md, docs/matching/matches.md).
  const matches = createMatchesService({ sequelize, media, hub });
  const interestLimiter = createMemberRateLimiter({
    windowMs: 60 * 1000,
    limit: LIMITS.INTEREST_ACTIONS_PER_MINUTE,
  });
  router.use(
    '/interests',
    createInterestsRouter({
      service: createInterestsService({
        sequelize,
        media,
        discovery,
        matches,
        safetyLog,
        notifier,
      }),
      authenticateMember,
      limiter: interestLimiter,
    }),
  );
  router.use(
    '/matches',
    createMatchesRouter({ service: matches, authenticateMember, limiter: interestLimiter }),
  );
  const safety = createSafetyRouters({
    blocks: createBlocksService({ sequelize, media, safetyLog, hub, suspicious }),
    reports: createReportsService({ sequelize, safetyLog, hub }),
    authenticateMember,
    blockLimiter: createMemberRateLimiter({ windowMs: HOUR_MS, limit: LIMITS.BLOCKS_PER_HOUR }),
    unblockLimiter: createMemberRateLimiter({
      windowMs: HOUR_MS,
      limit: LIMITS.UNBLOCKS_PER_HOUR,
    }),
    // Burst guard; the service also enforces REPORTS_PER_DAY over 24 hours.
    reportLimiter: createMemberRateLimiter({
      windowMs: HOUR_MS,
      limit: LIMITS.REPORTS_PER_DAY,
    }),
  });
  router.use('/blocks', safety.blocks);
  router.use('/reports', safety.reports);
  router.use(
    '/me',
    createMySafetyRouter({
      service: createMemberSafetyService(),
      authenticateMember,
      limiter: createMemberRateLimiter({ windowMs: 60 * 1000, limit: 30 }),
    }),
  );

  // Chat (docs/chat/architecture.md). Sending is rate-limited in the service (shared with sockets).
  router.use(
    '/chats',
    createChatRouter({
      service: createChatService({ sequelize, media, hub, suspicious, notifier }),
      authenticateMember,
      limiter: createMemberRateLimiter({
        windowMs: 60 * 1000,
        limit: LIMITS.SOCKET_EVENTS_PER_MINUTE,
      }),
    }),
  );
  // Event pass purchase (docs/payments/payment-flow.md).
  const payments = createPaymentsService({
    sequelize,
    env,
    gateway: dependencies.payments,
    notifier,
    logger,
  });
  router.use(
    '/orders',
    createOrdersRouter({
      service: payments,
      authenticateMember,
      orderLimiter: createMemberRateLimiter({
        windowMs: 60 * 1000,
        limit: LIMITS.ORDERS_PER_MINUTE,
      }),
      verifyLimiter: createMemberRateLimiter({
        windowMs: 60 * 1000,
        limit: LIMITS.PAYMENT_VERIFICATIONS_PER_MINUTE,
      }),
    }),
  );
  router.use('/bookings', createBookingsRouter({ service: payments, authenticateMember }));
  router.use(createPaymentWebhookRouter({ service: payments }));
  router.use(
    '/admin/payments',
    createAdminPaymentsRouter({
      service: createAdminPaymentsService({ payments }),
      authenticateAdmin,
    }),
  );
  router.use(
    '/notifications',
    createNotificationsRouter({
      service: createNotificationsService({ media }),
      authenticateMember,
      limiter: createMemberRateLimiter({
        windowMs: 60 * 1000,
        limit: LIMITS.NOTIFICATION_ACTIONS_PER_MINUTE,
      }),
    }),
  );
  router.use(
    '/admin/dashboard',
    createAdminDashboardRouter({
      service: createAdminDashboardService({ sequelize }),
      sequelize,
      env,
      authenticateAdmin,
      exportLimiter: createIpRateLimiter({
        windowMs: HOUR_MS,
        limit: LIMITS.DASHBOARD_EXPORTS_PER_HOUR,
      }),
    }),
  );
  router.use(
    '/admin/notifications',
    createAdminNotificationsRouter({
      service: createAdminNotificationsService({ sequelize }),
      authenticateAdmin,
    }),
  );
  router.use(
    '/admin/reports',
    createAdminReportsRouter({
      service: createAdminReportsService({ sequelize, env, media, hub, notifier }),
      authenticateAdmin,
    }),
  );

  router.use(
    '/events',
    createEventsRouter({
      service: createEventsService({ sequelize, media }),
      limiter: createIpRateLimiter({
        windowMs: 60 * 1000,
        limit: LIMITS.PUBLIC_EVENT_REQUESTS_PER_MINUTE,
      }),
    }),
  );
  router.use(
    '/admin',
    createAdminMatchesRouter({
      service: createAdminMatchesService({ sequelize, env, hub }),
      authenticateAdmin,
    }),
  );
  router.use(
    '/admin',
    createAdminLogsRouter({ service: createAdminLogsService(), authenticateAdmin }),
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
