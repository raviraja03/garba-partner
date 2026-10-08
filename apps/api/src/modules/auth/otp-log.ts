import type { Logger } from 'pino';
import { maskPhone } from '../../lib/log-sanitize.js';

export interface OtpLogEntry {
  purpose: 'LOGIN';
  phone: string;
  code: string;
  expiresAt: Date;
  requestId: string | undefined;
}

/**
 * Debugging aid, used ONLY when `LOG_OTP=true` (docs/development/logging.md#3-otp-logging):
 * prints the one-time code to the server log so a developer can sign in without an SMS.
 *
 *   [OTP] LOGIN | mobile=+91XXXXXX3210 | OTP=123456 | expiresAt=… | requestId=…
 *
 * The code is part of the message text on purpose: the logger redacts fields named `otp` and
 * `code`, which would hide it. This is the one place a code is written anywhere; it never goes
 * to `api_logs`, to the normal `[API]` lines or to the browser. The phone number is masked.
 */
export function logOtp(logger: Logger, entry: OtpLogEntry): void {
  logger.warn(
    `[OTP] ${entry.purpose} | mobile=${maskPhone(entry.phone)} | OTP=${entry.code} | expiresAt=${entry.expiresAt.toISOString()} | requestId=${entry.requestId ?? '-'}`,
  );
}
