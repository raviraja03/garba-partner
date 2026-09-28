import { jwtVerify, SignJWT } from 'jose';
import type { ServerEnv } from '@garba-partner/config/server';

const ISSUER = 'garba-partner';

/**
 * Member and admin tokens use different secrets AND different audiences, so a token issued for
 * one can never authenticate against the other.
 */
export const TOKEN_AUDIENCES = {
  member: 'garba-partner:app',
  admin: 'garba-partner:admin',
} as const;

export type TokenAudience = keyof typeof TOKEN_AUDIENCES;

export interface AccessTokenClaims {
  /** User ID (member) or admin ID (admin). */
  subjectId: string;
  /** Session row ID; checked against the database on every request. */
  sessionId: string;
}

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface TokenService {
  sign(audience: TokenAudience, claims: AccessTokenClaims): Promise<SignedAccessToken>;
  /** Resolves null for any invalid, expired, foreign-audience or malformed token. */
  verify(audience: TokenAudience, token: string): Promise<AccessTokenClaims | null>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TokenEnv = Pick<
  ServerEnv,
  | 'JWT_ACCESS_SECRET'
  | 'JWT_ADMIN_ACCESS_SECRET'
  | 'ACCESS_TOKEN_TTL_SECONDS'
  | 'ADMIN_ACCESS_TOKEN_TTL_SECONDS'
>;

/** Short-lived HS256 access tokens. They carry no personal data (no phone, no role). */
export function createTokenService(env: TokenEnv): TokenService {
  const encoder = new TextEncoder();
  const keys: Record<TokenAudience, Uint8Array> = {
    member: encoder.encode(env.JWT_ACCESS_SECRET),
    admin: encoder.encode(env.JWT_ADMIN_ACCESS_SECRET),
  };
  const ttlSeconds: Record<TokenAudience, number> = {
    member: env.ACCESS_TOKEN_TTL_SECONDS,
    admin: env.ADMIN_ACCESS_TOKEN_TTL_SECONDS,
  };

  return {
    async sign(audience, { subjectId, sessionId }) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAtSeconds = issuedAt + ttlSeconds[audience];
      const token = await new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(subjectId)
        .setIssuer(ISSUER)
        .setAudience(TOKEN_AUDIENCES[audience])
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAtSeconds)
        .sign(keys[audience]);
      return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
    },

    async verify(audience, token) {
      try {
        const { payload } = await jwtVerify(token, keys[audience], {
          algorithms: ['HS256'],
          issuer: ISSUER,
          audience: TOKEN_AUDIENCES[audience],
          requiredClaims: ['sub', 'sid', 'exp', 'iat'],
        });
        const { sub, sid } = payload;
        if (typeof sub !== 'string' || typeof sid !== 'string') return null;
        if (!UUID_PATTERN.test(sub) || !UUID_PATTERN.test(sid)) return null;
        return { subjectId: sub, sessionId: sid };
      } catch {
        return null;
      }
    },
  };
}
