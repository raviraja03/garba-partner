import type { ServerEnv } from '@garba-partner/config/server';
import {
  createMetaWhatsAppClient,
  type FetchLike,
  type MetaWhatsAppClient,
} from './whatsapp.client.js';

export {
  MetaWhatsAppError,
  metaMessageRef,
  signMetaBody,
  verifyMetaSignature,
  type FetchLike,
  type MetaWhatsAppClient,
  type TemplateComponent,
} from './whatsapp.client.js';

/**
 * The Meta client for this environment, or `null` when Meta is not configured (local
 * development with the `dev` and `log` providers). One client serves login codes and
 * notifications.
 */
export function createMetaClientFromEnv(
  env: Pick<
    ServerEnv,
    'META_WHATSAPP_ACCESS_TOKEN' | 'META_WHATSAPP_PHONE_NUMBER_ID' | 'META_WHATSAPP_API_VERSION'
  >,
  fetchImpl?: FetchLike,
): MetaWhatsAppClient | null {
  if (!env.META_WHATSAPP_ACCESS_TOKEN || !env.META_WHATSAPP_PHONE_NUMBER_ID) return null;
  return createMetaWhatsAppClient({
    accessToken: env.META_WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: env.META_WHATSAPP_API_VERSION,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}
