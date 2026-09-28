import { AppError } from './app-error.js';

/** Keyset cursor over (created_at DESC, id DESC). Opaque to clients. */
export interface Cursor {
  createdAt: string;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed === 'object' && parsed !== null) {
      const createdAt: unknown = Reflect.get(parsed, 'createdAt');
      const id: unknown = Reflect.get(parsed, 'id');
      if (
        typeof createdAt === 'string' &&
        !Number.isNaN(Date.parse(createdAt)) &&
        typeof id === 'string' &&
        UUID_PATTERN.test(id)
      ) {
        return { createdAt, id };
      }
    }
  } catch {
    // fall through
  }
  throw new AppError('VALIDATION_ERROR', {
    details: [{ path: 'cursor', message: 'Invalid cursor.' }],
  });
}
