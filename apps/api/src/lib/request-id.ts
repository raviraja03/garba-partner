import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { REQUEST_ID_HEADER } from '@garba-partner/shared';

const VALID_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Reuses a well-formed incoming request ID (e.g. from Nginx) or generates one, and echoes it. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER.toLowerCase()];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** The ID given to a request by `resolveRequestId` (pino-http keeps it on `req.id`). */
export function requestIdOf(req: IncomingMessage): string {
  const id: unknown = req.id;
  return typeof id === 'string' ? id : typeof id === 'number' ? String(id) : '-';
}
