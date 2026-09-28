import type { Response } from 'express';
import type { ApiSuccess, PaginationMeta } from '@garba-partner/shared';

/** Sends the standard success envelope. */
export function ok<TData>(res: Response, data: TData, message = 'Success', status = 200): void {
  const body: ApiSuccess<TData> = { success: true, message, data };
  res.status(status).json(body);
}

/** Sends a cursor-paginated list: `{ success, message, data: [...], meta: { nextCursor } }`. */
export function okPaginated<TItem>(
  res: Response,
  items: TItem[],
  meta: PaginationMeta,
  message = 'Success',
): void {
  const body: ApiSuccess<TItem[], PaginationMeta> = { success: true, message, data: items, meta };
  res.status(200).json(body);
}
