import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { Logger } from 'pino';
import type { InferCreationAttributes } from 'sequelize';
import { ApiLog } from '../../models/index.js';

export type ApiLogEntry = Omit<InferCreationAttributes<ApiLog>, 'id' | 'createdAt'>;

/** Where the request logger hands finished requests. `record` never blocks and never throws. */
export interface ApiLogSink {
  record(entry: ApiLogEntry): void;
}

export interface ApiLogStore extends ApiLogSink {
  /** Writes everything queued so far (shutdown, tests). */
  flush(): Promise<void>;
}

const DEFAULTS = { flushIntervalMs: 2000, maxBatch: 200, maxQueue: 5000 };

/**
 * Writes `api_logs` rows in batches, off the request path: a request only pushes onto an
 * in-memory queue, and one multi-row INSERT runs at most every `flushIntervalMs`.
 *
 * Logging must never hurt the API, so a failed write is reported once and the batch is dropped,
 * and when the database is down the queue is capped (`maxQueue`): the oldest entries are lost
 * rather than memory growing without limit. The `[API]` lines in the server log are unaffected.
 */
export function createApiLogStore(deps: {
  logger: Logger;
  flushIntervalMs?: number;
  maxBatch?: number;
  maxQueue?: number;
}): ApiLogStore {
  const { logger } = deps;
  const flushIntervalMs = deps.flushIntervalMs ?? DEFAULTS.flushIntervalMs;
  const maxBatch = deps.maxBatch ?? DEFAULTS.maxBatch;
  const maxQueue = deps.maxQueue ?? DEFAULTS.maxQueue;

  let queue: ApiLogEntry[] = [];
  let timer: NodeJS.Timeout | null = null;
  let writing: Promise<void> = Promise.resolve();
  let dropped = 0;

  async function writeAll(): Promise<void> {
    while (queue.length > 0) {
      const batch = queue.slice(0, maxBatch);
      queue = queue.slice(batch.length);
      try {
        await ApiLog.bulkCreate(batch, { validate: false, logging: false });
      } catch (err) {
        logger.error({ err, lost: batch.length }, 'API log batch could not be stored');
      }
    }
    if (dropped > 0) {
      logger.warn({ dropped }, 'API log queue was full: oldest entries were dropped');
      dropped = 0;
    }
  }

  function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // One writer at a time, so rows keep their order and the pool is never flooded.
    writing = writing.then(writeAll);
    return writing;
  }

  return {
    record(entry) {
      if (queue.length >= maxQueue) {
        queue.shift();
        dropped += 1;
      }
      queue.push(entry);
      if (queue.length >= maxBatch) {
        void flush();
      } else if (!timer) {
        timer = setTimeout(() => void flush(), flushIntervalMs);
        timer.unref();
      }
    },
    flush,
  };
}

/** Deletes `api_logs` rows older than `retentionDays`. Returns how many were removed. */
export async function purgeOldApiLogs(
  sequelize: Sequelize,
  retentionDays: number,
  now: Date = new Date(),
): Promise<number> {
  const rows = await sequelize.query<{ id: string }>(
    `DELETE FROM api_logs
      WHERE created_at < CAST(:now AS timestamptz) - make_interval(days => :days)
      RETURNING id`,
    { type: QueryTypes.SELECT, replacements: { now, days: retentionDays } },
  );
  return rows.length;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Runs the retention purge at start-up and then daily (started by `server.ts`). */
export function startApiLogRetention(deps: {
  sequelize: Sequelize;
  retentionDays: number;
  logger: Logger;
}): () => void {
  const { sequelize, retentionDays, logger } = deps;
  const run = (): void => {
    purgeOldApiLogs(sequelize, retentionDays).then(
      (purged) => {
        if (purged > 0) logger.info({ purged, retentionDays }, 'Old API logs removed');
      },
      (err: unknown) => {
        logger.error({ err }, 'API log retention failed');
      },
    );
  };
  const timer = setInterval(run, DAY_MS);
  timer.unref();
  run();
  return () => {
    clearInterval(timer);
  };
}
