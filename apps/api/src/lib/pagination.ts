import { Op, type WhereOptions } from 'sequelize';
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

// --- Sortable keyset pagination ------------------------------------------------------------

/**
 * A keyset ordering: `attribute` (a model attribute) then `id` as the tie-breaker, both in
 * `direction`. `kind` says how the cursor value is compared (dates are sent as ISO strings).
 */
export interface KeysetOrder {
  attribute: string;
  direction: 'ASC' | 'DESC';
  kind: 'date' | 'string';
}

/** Keyset cursor for a named sort. The sort name is embedded so a cursor can't be reused across sorts. */
export interface SortCursor {
  sort: string;
  value: string;
  id: string;
}

function invalidCursor(): AppError {
  return new AppError('VALIDATION_ERROR', {
    details: [{ path: 'cursor', message: 'Invalid cursor.' }],
  });
}

export function encodeSortCursor(cursor: SortCursor): string {
  return Buffer.from(JSON.stringify([cursor.sort, cursor.value, cursor.id]), 'utf8').toString(
    'base64url',
  );
}

export function decodeSortCursor(value: string, sort: string, order: KeysetOrder): SortCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) throw invalidCursor();
  const [cursorSort, cursorValue, id] = parsed as unknown[];
  if (
    cursorSort !== sort ||
    typeof cursorValue !== 'string' ||
    cursorValue.length > 300 ||
    typeof id !== 'string' ||
    !UUID_PATTERN.test(id) ||
    (order.kind === 'date' && Number.isNaN(Date.parse(cursorValue)))
  ) {
    throw invalidCursor();
  }
  return { sort, value: cursorValue, id };
}

/** WHERE condition selecting rows strictly after the cursor in the given order. */
export function keysetCondition(order: KeysetOrder, cursor: SortCursor): WhereOptions {
  const after = order.direction === 'ASC' ? Op.gt : Op.lt;
  const value = order.kind === 'date' ? new Date(cursor.value) : cursor.value;
  return {
    [Op.or]: [
      { [order.attribute]: { [after]: value } },
      { [order.attribute]: value, id: { [after]: cursor.id } },
    ],
  };
}

/** ORDER BY clause matching {@link keysetCondition}. */
export function keysetOrderBy(order: KeysetOrder): [string, string][] {
  return [
    [order.attribute, order.direction],
    ['id', order.direction],
  ];
}

/** Cursor for the last row of a page: its `order.attribute` value and id. */
export function cursorAfter(sort: string, value: Date | string, id: string): string {
  return encodeSortCursor({
    sort,
    value: value instanceof Date ? value.toISOString() : value,
    id,
  });
}
