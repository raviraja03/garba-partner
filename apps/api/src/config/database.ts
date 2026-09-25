import 'reflect-metadata';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import { MODELS } from '../models/index.js';

export interface DatabaseConfig {
  url: string;
  ssl: boolean;
  poolMax: number;
}

export function databaseConfigFromEnv(env: ServerEnv): DatabaseConfig {
  return { url: env.DATABASE_URL, ssl: env.DATABASE_SSL, poolMax: env.DATABASE_POOL_MAX };
}

/**
 * Creates the Sequelize instance with every model registered.
 * SQL logging is disabled: logged statements can contain personal data.
 */
export function createSequelize(config: DatabaseConfig): Sequelize {
  return new Sequelize(config.url, {
    dialect: 'postgres',
    models: [...MODELS],
    logging: false,
    timezone: '+00:00',
    define: { underscored: true, timestamps: true },
    pool: { max: config.poolMax, min: 0, idle: 10_000, acquire: 15_000 },
    dialectOptions: config.ssl ? { ssl: { require: true, rejectUnauthorized: true } } : {},
  });
}

/** Resolves true when `SELECT 1` succeeds within `timeoutMs`; never throws. */
export async function pingDatabase(sequelize: Sequelize, timeoutMs = 2_000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Database ping timed out'));
    }, timeoutMs);
  });

  try {
    await Promise.race([sequelize.query('SELECT 1', { type: QueryTypes.SELECT }), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
