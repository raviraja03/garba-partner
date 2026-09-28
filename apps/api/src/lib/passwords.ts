import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id with OWASP-recommended minimum parameters (19 MiB memory, 2 iterations,
 * parallelism 1). `@node-rs/argon2` defaults to the Argon2id variant.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same amount of work as a real verification. Used when the account does not exist
 * (or is disabled) so response timing does not reveal which emails are admin accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-equalisation');
  await verifyPassword(await dummyHash, password);
}
