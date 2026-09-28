import type { CookieOptions } from 'express';
import type { ServerEnv } from '@garba-partner/config/server';

/**
 * Options for refresh-token cookies: httpOnly (never readable by JavaScript), SameSite=Strict
 * (never sent cross-site) and scoped to the auth path only, so the token is not attached to any
 * other request. `Secure` everywhere except local development over http://localhost.
 */
export function refreshCookieOptions(
  env: Pick<ServerEnv, 'APP_ENV'>,
  path: string,
  expiresAt?: Date,
): CookieOptions {
  return {
    httpOnly: true,
    secure: env.APP_ENV !== 'development',
    sameSite: 'strict',
    path,
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

/** Reads a cookie set by cookie-parser without trusting its type. */
export function readCookie(cookies: unknown, name: string): string | undefined {
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value: unknown = Reflect.get(cookies, name);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
