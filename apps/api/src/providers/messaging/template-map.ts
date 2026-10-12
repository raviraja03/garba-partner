import { NOTIFICATION_TYPES, type NotificationType } from '@garba-partner/shared';

/** Which approved template to use for each notification type. Types without one are not sent. */
export type TemplateMap = Partial<Record<NotificationType, string>>;

/**
 * Parses `interest_received:TEMPLATE_A,match_created:TEMPLATE_B` (the format of
 * META_WHATSAPP_TEMPLATES). Throws on an unknown notification type, so a typo stops the API at
 * start-up instead of silently sending nothing.
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
