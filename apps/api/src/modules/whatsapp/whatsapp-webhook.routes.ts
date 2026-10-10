import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { AppError } from '../../lib/app-error.js';
import { ok } from '../../lib/response.js';
import { verifyMetaSignature } from '../../providers/meta/index.js';
import type { WhatsAppWebhookService } from './whatsapp-webhook.service.js';

/** Registered in the Meta app dashboard as `https://<API domain>/api/v1/webhooks/meta/whatsapp`. */
export const META_WHATSAPP_WEBHOOK_PATH = '/webhooks/meta/whatsapp';

const sameText = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Meta's webhook for WhatsApp delivery reports (docs/notifications/meta-whatsapp.md#6-webhook).
 * No session: a GET is proven by the verify token, a POST by the HMAC signature over the exact
 * bytes received (`req.rawBody`, kept for this path only in `app.ts`).
 *
 * - `GET`: Meta's one-time check when the webhook is registered. Echo `hub.challenge` if the
 *   token matches.
 * - `POST`: status reports. A request without a valid signature is refused and changes nothing,
 *   whatever message IDs or phone numbers it contains.
 */
export function createWhatsAppWebhookRouter(deps: {
  service: WhatsAppWebhookService;
  appSecret: string;
  verifyToken: string;
}): Router {
  const router = Router();

  router.get(META_WHATSAPP_WEBHOOK_PATH, (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const valid =
      mode === 'subscribe' &&
      typeof token === 'string' &&
      typeof challenge === 'string' &&
      /^[\w-]{1,128}$/.test(challenge) &&
      sameText(token, deps.verifyToken);
    if (!valid) throw new AppError('FORBIDDEN', { message: 'Webhook verification failed.' });
    // Meta expects the challenge back as the whole body, in plain text.
    res.status(200).type('text/plain').send(challenge);
  });

  router.post(META_WHATSAPP_WEBHOOK_PATH, async (req, res) => {
    const signature = req.get('X-Hub-Signature-256');
    if (!req.rawBody || !verifyMetaSignature(req.rawBody, signature, deps.appSecret)) {
      throw new AppError('UNAUTHENTICATED', { message: 'Invalid webhook signature.' });
    }
    // Applied before answering: if the database is down this fails with a 500 and Meta sends
    // the report again later. Applying a report twice changes nothing.
    await deps.service.handle(req.body as unknown);
    ok(res, null, 'Received');
  });

  return router;
}
