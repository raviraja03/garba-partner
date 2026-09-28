import { describe, expect, it } from 'vitest';
import { createTestEnv } from '../../test/helpers.js';
import { createTokenService } from './token.service.js';

const env = createTestEnv();
const tokens = createTokenService(env);
const claims = {
  subjectId: '6f1c2b1e-9a3b-4c7e-8d1a-0b2c3d4e5f60',
  sessionId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
};

describe('token service', () => {
  it('round-trips member and admin tokens with their own audience', async () => {
    const member = await tokens.sign('member', claims);
    const admin = await tokens.sign('admin', claims);

    expect(await tokens.verify('member', member.token)).toEqual(claims);
    expect(await tokens.verify('admin', admin.token)).toEqual(claims);
    expect(member.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('never accepts a token for the other audience', async () => {
    const member = await tokens.sign('member', claims);
    const admin = await tokens.sign('admin', claims);

    expect(await tokens.verify('admin', member.token)).toBeNull();
    expect(await tokens.verify('member', admin.token)).toBeNull();
  });

  it('rejects tampered, unsigned and expired tokens', async () => {
    const { token } = await tokens.sign('member', claims);
    const [header = '', payload = ''] = token.split('.');
    const unsigned = `${header}.${payload}.`;
    const tampered = `${token.slice(0, -2)}xx`;
    const expired = await createTokenService({ ...env, ACCESS_TOKEN_TTL_SECONDS: -10 }).sign(
      'member',
      claims,
    );

    expect(await tokens.verify('member', unsigned)).toBeNull();
    expect(await tokens.verify('member', tampered)).toBeNull();
    expect(await tokens.verify('member', expired.token)).toBeNull();
  });

  it('carries no personal data', async () => {
    const { token } = await tokens.sign('member', claims);
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sid', 'sub']);
  });
});
