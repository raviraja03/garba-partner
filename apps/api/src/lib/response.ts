import type { Response } from 'express';
import type { ApiSuccess } from '@garba-partner/shared';

/** Sends the standard success envelope. */
export function ok<TData>(res: Response, data: TData, message = 'Success', status = 200): void {
  const body: ApiSuccess<TData> = { success: true, message, data };
  res.status(status).json(body);
}
