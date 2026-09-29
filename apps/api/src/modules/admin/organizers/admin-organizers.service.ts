import {
  Op,
  UniqueConstraintError,
  type InferAttributes,
  type Transaction,
  type WhereOptions,
} from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  LIMITS,
  type AdminOrganizerDto,
  type AdminOrganizerListItemDto,
  type AdminOrganizerListQueryData,
  type CreateOrganizerData,
  type OrganizerOptionDto,
  type PaginationMeta,
  type UpdateOrganizerData,
} from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import {
  cursorAfter,
  decodeSortCursor,
  keysetCondition,
  keysetOrderBy,
  type KeysetOrder,
} from '../../../lib/pagination.js';
import { escapeLike } from '../../../lib/sql.js';
import { Event, EventOrganizer } from '../../../models/index.js';
import { toAdminOrganizerDto, toAdminOrganizerListItemDto } from '../../events/event.mapper.js';
import { recordAdminAction } from '../audit/audit.service.js';
import type { AdminActor } from '../users/admin-users.service.js';

const NAME_ORDER: KeysetOrder = { attribute: 'name', direction: 'ASC', kind: 'string' };
const NAME_SORT = 'name_asc';

/** Changing how an organizer presents itself publicly clears its verified badge. */
const PUBLIC_IDENTITY_FIELDS = ['name', 'websiteUrl', 'instagramHandle'] as const;

export interface OrganizerViewer {
  /** Admins with `events:manage` see private contact details; others (moderators) do not. */
  canSeeContact: boolean;
}

export interface AdminOrganizersService {
  list(
    query: AdminOrganizerListQueryData,
  ): Promise<{ items: AdminOrganizerListItemDto[]; meta: PaginationMeta }>;
  options(): Promise<OrganizerOptionDto[]>;
  get(organizerId: string, viewer: OrganizerViewer): Promise<AdminOrganizerDto>;
  create(actor: AdminActor, input: CreateOrganizerData): Promise<AdminOrganizerDto>;
  update(
    actor: AdminActor,
    organizerId: string,
    input: UpdateOrganizerData,
  ): Promise<AdminOrganizerDto>;
  verify(actor: AdminActor, organizerId: string): Promise<AdminOrganizerDto>;
  unverify(actor: AdminActor, organizerId: string): Promise<AdminOrganizerDto>;
  archive(actor: AdminActor, organizerId: string): Promise<AdminOrganizerDto>;
  restore(actor: AdminActor, organizerId: string): Promise<AdminOrganizerDto>;
}

const duplicateName = () =>
  new AppError('CONFLICT', {
    message: 'An organizer with this name already exists.',
    details: [{ path: 'name', message: 'An organizer with this name already exists.' }],
  });

/** Organizer management (docs/events/organizer-management.md). Every write is audited. */
export function createAdminOrganizersService(deps: {
  sequelize: Sequelize;
  env: ServerEnv;
}): AdminOrganizersService {
  const { sequelize, env } = deps;
  const withManager = { canSeeContact: true };

  async function getDetail(organizerId: string, viewer: OrganizerViewer) {
    const organizer = await EventOrganizer.findByPk(organizerId);
    if (!organizer) throw new AppError('NOT_FOUND', { message: 'Organizer not found.' });
    const [total, upcomingPublished] = await Promise.all([
      Event.count({ where: { organizerId } }),
      Event.count({
        where: { organizerId, status: 'published', endsAt: { [Op.gt]: new Date() } },
      }),
    ]);
    return toAdminOrganizerDto(organizer, {
      includeContact: viewer.canSeeContact,
      eventCounts: { total, upcomingPublished },
    });
  }

  function audit(
    actor: AdminActor,
    action: string,
    organizerId: string,
    metadata: Record<string, unknown>,
    transaction: Transaction,
  ) {
    return recordAdminAction(
      {
        adminId: actor.adminId,
        action,
        targetType: 'organizer',
        targetId: organizerId,
        metadata,
        ip: actor.ip,
      },
      env.OTP_HMAC_SECRET,
      transaction,
    );
  }

  /** Locks the organizer, applies a state change and audits it, all in one transaction. */
  async function transition(
    actor: AdminActor,
    organizerId: string,
    action: string,
    apply: (
      organizer: EventOrganizer,
      transaction: Transaction,
    ) => Promise<Partial<EventOrganizer>> | Partial<EventOrganizer>,
  ): Promise<AdminOrganizerDto> {
    await sequelize.transaction(async (transaction) => {
      const organizer = await EventOrganizer.findByPk(organizerId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      if (!organizer) throw new AppError('NOT_FOUND', { message: 'Organizer not found.' });
      const changes = await apply(organizer, transaction);
      await organizer.update({ ...changes, updatedByAdminId: actor.adminId }, { transaction });
      await audit(actor, action, organizerId, {}, transaction);
    });
    return getDetail(organizerId, withManager);
  }

  return {
    async list(query) {
      const limit = Math.min(
        Math.max(query.limit ?? LIMITS.ADMIN_PAGE_SIZE_DEFAULT, 1),
        LIMITS.ADMIN_PAGE_SIZE_MAX,
      );
      const conditions: WhereOptions[] = [];
      if (query.status) conditions.push({ status: query.status });
      if (query.verified !== undefined) conditions.push({ isVerified: query.verified });
      if (query.q) conditions.push({ name: { [Op.iLike]: `%${escapeLike(query.q)}%` } });
      if (query.cursor) {
        conditions.push(
          keysetCondition(NAME_ORDER, decodeSortCursor(query.cursor, NAME_SORT, NAME_ORDER)),
        );
      }

      const rows = await EventOrganizer.findAll({
        where: { [Op.and]: conditions },
        attributes: ['id', 'name', 'isVerified', 'status', 'createdAt'],
        order: keysetOrderBy(NAME_ORDER),
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toAdminOrganizerListItemDto),
        meta: {
          nextCursor:
            rows.length > limit && last ? cursorAfter(NAME_SORT, last.name, last.id) : null,
        },
      };
    },

    async options() {
      const organizers = await EventOrganizer.findAll({
        where: { status: 'active' },
        attributes: ['id', 'name', 'isVerified'],
        order: keysetOrderBy(NAME_ORDER),
        limit: LIMITS.ORGANIZER_OPTIONS_MAX,
      });
      return organizers.map((o) => ({ id: o.id, name: o.name, isVerified: o.isVerified }));
    },

    get: getDetail,

    async create(actor, input) {
      let organizerId = '';
      try {
        await sequelize.transaction(async (transaction) => {
          const organizer = await EventOrganizer.create(
            {
              name: input.name,
              description: input.description ?? null,
              websiteUrl: input.websiteUrl ?? null,
              instagramHandle: input.instagramHandle ?? null,
              contactName: input.contactName ?? null,
              contactEmail: input.contactEmail ?? null,
              contactPhone: input.contactPhone ?? null,
              notes: input.notes ?? null,
              createdByAdminId: actor.adminId,
              updatedByAdminId: actor.adminId,
            },
            { transaction },
          );
          organizerId = organizer.id;
          // Field names only: contact values never go into the audit log.
          await audit(actor, 'organizer.create', organizer.id, { name: input.name }, transaction);
        });
      } catch (error) {
        if (error instanceof UniqueConstraintError) throw duplicateName();
        throw error;
      }
      return getDetail(organizerId, withManager);
    },

    async update(actor, organizerId, input) {
      try {
        await sequelize.transaction(async (transaction) => {
          const organizer = await EventOrganizer.findByPk(organizerId, {
            lock: transaction.LOCK.UPDATE,
            transaction,
          });
          if (!organizer) throw new AppError('NOT_FOUND', { message: 'Organizer not found.' });
          if (organizer.status === 'archived') {
            throw new AppError('CONFLICT', {
              message: 'Restore this organizer before editing it.',
            });
          }

          const changes: Partial<Record<keyof UpdateOrganizerData, string | null>> = {};
          for (const [key, value] of Object.entries(input) as [
            keyof UpdateOrganizerData,
            string | null | undefined,
          ][]) {
            if (value !== undefined && organizer.get(key) !== value) changes[key] = value;
          }
          const fields = Object.keys(changes);
          if (fields.length === 0) return;

          const verificationReset =
            organizer.isVerified && PUBLIC_IDENTITY_FIELDS.some((field) => field in changes);
          await organizer.update(
            {
              // Keys and value types come from the validated update schema.
              ...(changes as Partial<InferAttributes<EventOrganizer>>),
              ...(verificationReset ? { isVerified: false, verifiedAt: null } : {}),
              updatedByAdminId: actor.adminId,
            },
            { transaction },
          );
          await audit(
            actor,
            'organizer.update',
            organizerId,
            { fields, verificationReset },
            transaction,
          );
        });
      } catch (error) {
        if (error instanceof UniqueConstraintError) throw duplicateName();
        throw error;
      }
      return getDetail(organizerId, withManager);
    },

    verify: (actor, organizerId) =>
      transition(actor, organizerId, 'organizer.verify', (organizer) => {
        if (organizer.status === 'archived') {
          throw new AppError('CONFLICT', { message: 'Archived organizers cannot be verified.' });
        }
        if (organizer.isVerified) {
          throw new AppError('CONFLICT', { message: 'This organizer is already verified.' });
        }
        return { isVerified: true, verifiedAt: new Date() };
      }),

    unverify: (actor, organizerId) =>
      transition(actor, organizerId, 'organizer.unverify', (organizer) => {
        if (!organizer.isVerified) {
          throw new AppError('CONFLICT', { message: 'This organizer is not verified.' });
        }
        return { isVerified: false, verifiedAt: null };
      }),

    archive: (actor, organizerId) =>
      transition(actor, organizerId, 'organizer.archive', async (organizer, transaction) => {
        if (organizer.status === 'archived') {
          throw new AppError('CONFLICT', { message: 'This organizer is already archived.' });
        }
        const upcoming = await Event.count({
          where: { organizerId, status: 'published', endsAt: { [Op.gt]: new Date() } },
          transaction,
        });
        if (upcoming > 0) {
          throw new AppError('CONFLICT', {
            message: `This organizer has ${String(upcoming)} upcoming published event(s). Unpublish or archive them first.`,
          });
        }
        return { status: 'archived', archivedAt: new Date() };
      }),

    restore: (actor, organizerId) =>
      transition(actor, organizerId, 'organizer.restore', (organizer) => {
        if (organizer.status !== 'archived') {
          throw new AppError('CONFLICT', { message: 'This organizer is not archived.' });
        }
        return { status: 'active', archivedAt: null };
      }),
  };
}
