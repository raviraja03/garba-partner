import type { ServerEnv } from '@garba-partner/config/server';
import { devSmsProvider } from './dev.sms.js';
import type { SmsProvider } from './sms.provider.js';

export type { SmsProvider } from './sms.provider.js';

export function createSmsProvider(env: Pick<ServerEnv, 'SMS_PROVIDER'>): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'dev':
      return devSmsProvider;
  }
}
