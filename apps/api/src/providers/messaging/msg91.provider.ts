import { NOTIFICATION_TYPES, type NotificationType } from '@garba-partner/shared';
import {
  MSG91_FLOW_OPTIONS,
  MSG91_FLOW_URL,
  MSG91_WHATSAPP_URL,
  msg91Post,
  toMsg91Mobile,
  type FetchLike,
} from '../msg91/client.js';
import type { MessageProvider } from './message.provider.js';

/** Which MSG91 template to use for each notification type. Types without one are not sent. */
export type TemplateMap = Partial<Record<NotificationType, string>>;

/**
 * Parses `interest_received:TEMPLATE_A,match_created:TEMPLATE_B` (the format of
 * MSG91_SMS_TEMPLATE_IDS and MSG91_WHATSAPP_TEMPLATES). Throws on an unknown notification type,
 * so a typo stops the API at start-up instead of silently sending nothing.
 */
export function parseTemplateMap(value: string | undefined, variable: string): TemplateMap {
  const map: TemplateMap = {};
  for (const pair of (value ?? '').split(',')) {
    const [type, template] = pair.split(':').map((part) => part.trim());
    if (!type && !template) continue;
    if (!type || !template || !(NOTIFICATION_TYPES as readonly string[]).includes(type)) {
      throw new Error(
        `${variable}: "${pair.trim()}" is not "<notification type>:<template>". Types: ${NOTIFICATION_TYPES.join(', ')}`,
      );
    }
    map[type as NotificationType] = template;
  }
  return map;
}

/**
 * Notification SMS through MSG91's Flow API. Each notification type needs its own
 * DLT-approved template (fixed text, no variables); `templates` maps type → template ID.
 */
export function createMsg91SmsMessageProvider(options: {
  authKey: string;
  templates: TemplateMap;
  fetchImpl?: FetchLike;
}): MessageProvider {
  const { authKey, templates, fetchImpl } = options;
  return {
    name: 'msg91',
    channel: 'sms',
    supports: (type) => templates[type] !== undefined,
    send(message) {
      const templateId = templates[message.type];
      if (!templateId) return Promise.reject(new Error('No MSG91 SMS template for this type'));
      return msg91Post(
        MSG91_FLOW_URL,
        authKey,
        {
          template_id: templateId,
          ...MSG91_FLOW_OPTIONS,
          recipients: [{ mobiles: toMsg91Mobile(message.to) }],
        },
        fetchImpl,
      );
    },
  };
}

/**
 * Notification WhatsApp messages through MSG91. Each notification type needs a template
 * approved by Meta (fixed text, no variables); `templates` maps type → template name.
 */
export function createMsg91WhatsAppProvider(options: {
  authKey: string;
  /** The WhatsApp Business number connected in MSG91, digits with country code. */
  integratedNumber: string;
  templates: TemplateMap;
  languageCode: string;
  namespace?: string | undefined;
  fetchImpl?: FetchLike;
}): MessageProvider {
  const { authKey, integratedNumber, templates, languageCode, namespace, fetchImpl } = options;
  return {
    name: 'msg91',
    channel: 'whatsapp',
    supports: (type) => templates[type] !== undefined,
    send(message) {
      const name = templates[message.type];
      if (!name) return Promise.reject(new Error('No MSG91 WhatsApp template for this type'));
      return msg91Post(
        MSG91_WHATSAPP_URL,
        authKey,
        {
          integrated_number: toMsg91Mobile(integratedNumber),
          content_type: 'template',
          payload: {
            messaging_product: 'whatsapp',
            type: 'template',
            template: {
              name,
              language: { code: languageCode, policy: 'deterministic' },
              ...(namespace ? { namespace } : {}),
              to_and_components: [{ to: [toMsg91Mobile(message.to)], components: {} }],
            },
          },
        },
        fetchImpl,
      );
    },
  };
}
