// Chat: shared by the API (REST + Socket.IO) and the web client. See docs/chat/socket-events.md.
import * as z from 'zod/mini';
import { LIMITS } from '../constants/limits.js';
import { stripInvisible } from '../utils/text.js';

/** Plain text, 1–1000 characters after trimming. Invisible/control characters are removed. */
export const messageBodySchema = z.pipe(
  z.string().check(z.maxLength(LIMITS.MESSAGE_MAX_LENGTH * 2, 'Message is too long.')),
  z.transform((value, ctx) => {
    const body = stripInvisible(value).normalize('NFC').replace(/\r\n?/g, '\n').trim();
    if (body.length === 0) {
      ctx.issues.push({ code: 'custom', message: 'Message is empty.', input: value });
    } else if (body.length > LIMITS.MESSAGE_MAX_LENGTH) {
      ctx.issues.push({
        code: 'custom',
        message: `Messages can be at most ${String(LIMITS.MESSAGE_MAX_LENGTH)} characters.`,
        input: value,
      });
    }
    return body;
  }),
);

/** `POST /api/v1/chats/:matchId/messages` */
export const sendMessageSchema = z.strictObject({
  /** Client-generated UUID: retries with the same ID never create a duplicate. */
  clientMessageId: z.uuid('Invalid message id.'),
  body: messageBodySchema,
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;
export type SendMessageData = z.output<typeof sendMessageSchema>;

/** Socket `message:send` payload. */
export const socketSendMessageSchema = z.strictObject({
  matchId: z.uuid('Invalid chat.'),
  clientMessageId: z.uuid('Invalid message id.'),
  body: messageBodySchema,
});
export type SocketSendMessageInput = z.input<typeof socketSendMessageSchema>;

/** `POST /api/v1/chats/:matchId/read` */
export const markReadSchema = z.strictObject({
  lastReadMessageId: z.uuid('Invalid message id.'),
});

/** Socket `message:read` payload. */
export const socketMarkReadSchema = z.strictObject({
  matchId: z.uuid('Invalid chat.'),
  lastReadMessageId: z.uuid('Invalid message id.'),
});
export type SocketMarkReadInput = z.input<typeof socketMarkReadSchema>;

/** `GET /api/v1/chats/:matchId/messages` — newest first; `cursor` loads older messages. */
export const messageListQuerySchema = z.strictObject({
  cursor: z.optional(z.string().check(z.maxLength(200))),
  limit: z.optional(
    z.pipe(z.string().check(z.regex(/^\d{1,3}$/, 'limit must be a number')), z.transform(Number)),
  ),
});
export type MessageListQueryData = z.output<typeof messageListQuerySchema>;
