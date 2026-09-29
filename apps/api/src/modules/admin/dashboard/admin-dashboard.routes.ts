import { Router, type Request, type RequestHandler } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  adminDashboardEventsQuerySchema,
  adminDashboardQuerySchema,
  type AdminDashboardEventRowDto,
} from '@garba-partner/shared';
import { ok, okPaginated } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { adminAuth } from '../../../middlewares/authenticate.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import { recordAdminAction } from '../audit/audit.service.js';
import type { AdminDashboardService } from './admin-dashboard.service.js';

const CSV_COLUMNS = [
  'event_id',
  'event_name',
  'event_date',
  'city',
  'status',
  'going',
  'interested',
  'looking_for_partner',
  'matches',
  'pass_price_inr',
  'capacity',
  'bookings',
  'passes_sold',
  'gross_inr',
  'refunded_inr',
  'net_inr',
] as const;

/**
 * One CSV cell. Values starting with `= + - @` (or tab/CR) are prefixed with `'` so spreadsheet
 * apps never evaluate them as formulas (CSV injection).
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const rupees = (paise: number | null | undefined) =>
  paise === null || paise === undefined ? null : (paise / 100).toFixed(2);

export function toCsv(rows: AdminDashboardEventRowDto[]): string {
  const lines = rows.map((row) =>
    [
      row.id,
      row.name,
      row.eventDate,
      row.city,
      row.status,
      row.going,
      row.interested,
      row.lookingForPartner,
      row.matches,
      rupees(row.sales?.pricePaise),
      row.sales?.capacity ?? null,
      row.sales?.bookings ?? 0,
      row.sales?.passesSold ?? 0,
      rupees(row.sales?.grossPaise ?? 0),
      rupees(row.sales?.refundedPaise ?? 0),
      rupees((row.sales?.grossPaise ?? 0) - (row.sales?.refundedPaise ?? 0)),
    ]
      .map(csvCell)
      .join(','),
  );
  return `${[CSV_COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
}

/**
 * Dashboard, mounted at `/api/v1/admin/dashboard` (docs/admin/dashboard.md). Every route needs
 * `dashboard:view`; sections, per-event data and the export add their own permissions.
 */
export function createAdminDashboardRouter(deps: {
  service: AdminDashboardService;
  sequelize: Sequelize;
  env: ServerEnv;
  authenticateAdmin: RequestHandler;
  exportLimiter: RequestHandler;
}): Router {
  const { service } = deps;
  const router = Router();
  const role = (req: Request) => adminAuth(req).role;
  router.use(deps.authenticateAdmin, requirePermission('dashboard:view'), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/summary', async (req, res) => {
    const query = parseInput(adminDashboardQuerySchema, req.query);
    ok(res, await service.summary(role(req), query));
  });

  router.get('/trends', async (req, res) => {
    const query = parseInput(adminDashboardQuerySchema, req.query);
    ok(res, await service.trends(role(req), query));
  });

  router.get('/events', requirePermission('events:view'), async (req, res) => {
    const query = parseInput(adminDashboardEventsQuerySchema, req.query);
    const { items, meta } = await service.events(role(req), query);
    okPaginated(res, items, meta);
  });

  /**
   * Per-event sales CSV for finance reconciliation (organizer settlements, GST): aggregates only,
   * no member data. Needs `payments:view` as well; every export is audited.
   */
  router.get(
    '/events/export',
    requirePermission('events:view'),
    requirePermission('payments:view'),
    deps.exportLimiter,
    async (req, res) => {
      const query = parseInput(adminDashboardQuerySchema, req.query);
      const period = await service.resolvePeriod(query);
      const rows = await service.exportEvents(query);
      await deps.sequelize.transaction((transaction) =>
        recordAdminAction(
          {
            adminId: adminAuth(req).adminId,
            action: 'dashboard.export',
            targetType: 'event',
            targetId: null,
            metadata: {
              report: 'event_sales',
              from: period.from,
              to: period.to,
              cityId: period.cityId,
              rows: rows.length,
            },
            ip: req.ip ?? 'unknown',
          },
          deps.env.OTP_HMAC_SECRET,
          transaction,
        ),
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="event-sales-${period.from}-to-${period.to}.csv"`,
      );
      res.status(200).send(toCsv(rows));
    },
  );

  return router;
}
