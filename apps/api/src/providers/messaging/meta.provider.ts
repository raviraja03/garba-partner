import { metaMessageRef, type MetaWhatsAppClient } from '../meta/index.js';
import type { MessageProvider } from './message.provider.js';
import type { TemplateMap } from './template-map.js';

/**
 * Notification WhatsApp messages through the Meta Cloud API. Each notification type needs its
 * own approved "Utility" template with fixed text (no variables); `templates` maps
 * type → template name. A type without a template is not sent.
 */
export function createMetaWhatsAppMessageProvider(options: {
  client: MetaWhatsAppClient;
  templates: TemplateMap;
  languageCode: string;
}): MessageProvider {
  const { client, templates, languageCode } = options;
  return {
    name: 'meta',
    channel: 'whatsapp',
    supports: (type) => templates[type] !== undefined,
    async send(message) {
      const template = templates[message.type];
      if (!template) throw new Error('No WhatsApp template for this notification type');
      const { messageId } = await client.sendTemplate({
        to: message.to,
        template,
        language: languageCode,
      });
      // Stored hashed: see `metaMessageRef`.
      return { providerMessageId: metaMessageRef(messageId) };
    },
  };
}
