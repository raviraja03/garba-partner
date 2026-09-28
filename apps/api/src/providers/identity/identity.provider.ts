import type { IncomingHttpHeaders } from 'node:http';
import type { VerificationFailureReason, VerificationProvider } from '@garba-partner/shared';

/** A hosted verification session at the provider. */
export interface IdentitySession {
  /** Opaque provider reference (never a document number). */
  providerReference: string;
  /** Provider-hosted page where the member completes verification (consent, documents, liveness). */
  redirectUrl: string;
  expiresAt: Date;
}

export type IdentityOutcome =
  | { status: 'pending' }
  | { status: 'approved' }
  | { status: 'expired' }
  | { status: 'rejected'; failureReason: VerificationFailureReason };

/** The ONLY information we keep from a provider callback. Everything else is discarded unread. */
export interface IdentityWebhookEvent {
  providerReference: string;
  outcome: IdentityOutcome;
}

/**
 * Adapter for a licensed identity-verification provider (docs/safety/identity-verification.md).
 *
 * Contract:
 * - Document checks (e.g. DigiLocker/Aadhaar consent) happen entirely on the PROVIDER's pages.
 *   Aadhaar numbers, document images and KYC payloads never reach this application.
 * - `parseWebhook` must authenticate the callback (signature + freshness) before reading it, and
 *   must return only the allow-listed fields above. Age must be reported as a boolean
 *   ("over 18"), never as a date of birth.
 */
export interface IdentityProvider {
  readonly name: VerificationProvider;
  createSession(input: { returnUrl: string }): Promise<IdentitySession>;
  /** Throws AppError UNAUTHENTICATED for bad signatures, VALIDATION_ERROR for bad payloads. */
  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): IdentityWebhookEvent;
}
