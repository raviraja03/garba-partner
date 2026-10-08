import type { ServerEnv } from '@garba-partner/config/server';
import type { FetchLike } from '../msg91/client.js';
import { devSmsProvider } from './dev.sms.js';
import { createMsg91SmsProvider } from './msg91.sms.js';
import type { SmsProvider } from './sms.provider.js';

export type { SmsProvider } from './sms.provider.js';

export function createSmsProvider(
  env: Pick<ServerEnv, 'SMS_PROVIDER' | 'MSG91_AUTH_KEY' | 'MSG91_OTP_TEMPLATE_ID'>,
  fetchImpl?: FetchLike,
): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'dev':
      return devSmsProvider;
    case 'msg91':
      // `loadServerEnv()` guarantees both values when SMS_PROVIDER=msg91.
      return createMsg91SmsProvider({
        authKey: env.MSG91_AUTH_KEY ?? '',
        otpTemplateId: env.MSG91_OTP_TEMPLATE_ID ?? '',
        ...(fetchImpl ? { fetchImpl } : {}),
      });
  }
}
