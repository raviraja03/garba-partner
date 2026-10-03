import { AdminAuditLog } from './admin-audit-log.model.js';
import { AdminSession } from './admin-session.model.js';
import { AdminUser } from './admin-user.model.js';
import { Area } from './area.model.js';
import { Block } from './block.model.js';
import { City } from './city.model.js';
import { EventAttendance } from './event-attendance.model.js';
import { EventBooking } from './event-booking.model.js';
import { EventOrganizer } from './event-organizer.model.js';
import { Event } from './event.model.js';
import { Match } from './match.model.js';
import { Message } from './message.model.js';
import { NotificationPreference } from './notification-preference.model.js';
import { Notification } from './notification.model.js';
import { Order } from './order.model.js';
import { OtpRequest } from './otp-request.model.js';
import { PartnerInterest } from './partner-interest.model.js';
import { PaymentWebhookEvent } from './payment-webhook-event.model.js';
import { Payment } from './payment.model.js';
import { Report } from './report.model.js';
import { SafetyLog } from './safety-log.model.js';
import { UserPreference } from './user-preference.model.js';
import { UserProfile } from './user-profile.model.js';
import { UserSanction } from './user-sanction.model.js';
import { UserSession } from './user-session.model.js';
import { UserVerification } from './user-verification.model.js';
import { User } from './user.model.js';

export {
  AdminAuditLog,
  AUDIT_TARGET_TYPES,
  type AuditTargetType,
} from './admin-audit-log.model.js';
export { AdminSession } from './admin-session.model.js';
export { AdminUser } from './admin-user.model.js';
export { Area } from './area.model.js';
export { Block } from './block.model.js';
export { City } from './city.model.js';
export { EventAttendance } from './event-attendance.model.js';
export { EventBooking } from './event-booking.model.js';
export { EventOrganizer, ORGANIZER_PUBLIC_ATTRIBUTES } from './event-organizer.model.js';
export { Event } from './event.model.js';
export { canonicalPair, Match } from './match.model.js';
export { Message } from './message.model.js';
export { NotificationPreference } from './notification-preference.model.js';
export { Notification, type NotificationData } from './notification.model.js';
export { Order } from './order.model.js';
export { OtpRequest } from './otp-request.model.js';
export { PartnerInterest } from './partner-interest.model.js';
export { PaymentWebhookEvent } from './payment-webhook-event.model.js';
export { Payment } from './payment.model.js';
export { Report, type ReportEvidence } from './report.model.js';
export { SafetyLog } from './safety-log.model.js';
export { User, USER_PHONE_ATTRIBUTES } from './user.model.js';
export { UserPreference } from './user-preference.model.js';
export { UserProfile } from './user-profile.model.js';
export { UserSanction } from './user-sanction.model.js';
export { UserSession } from './user-session.model.js';
export { UserVerification } from './user-verification.model.js';

/** Every model registered with the Sequelize instance. */
export const MODELS = [
  User,
  UserProfile,
  UserPreference,
  UserSession,
  UserVerification,
  OtpRequest,
  AdminUser,
  AdminSession,
  AdminAuditLog,
  City,
  Area,
  Block,
  Report,
  SafetyLog,
  EventOrganizer,
  Event,
  EventAttendance,
  PartnerInterest,
  Match,
  Message,
  UserSanction,
  Notification,
  NotificationPreference,
  Order,
  Payment,
  EventBooking,
  PaymentWebhookEvent,
];
