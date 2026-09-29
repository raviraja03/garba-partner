import { AdminAuditLog } from './admin-audit-log.model.js';
import { AdminSession } from './admin-session.model.js';
import { AdminUser } from './admin-user.model.js';
import { Area } from './area.model.js';
import { Block } from './block.model.js';
import { City } from './city.model.js';
import { EventOrganizer } from './event-organizer.model.js';
import { Event } from './event.model.js';
import { OtpRequest } from './otp-request.model.js';
import { Report } from './report.model.js';
import { SafetyLog } from './safety-log.model.js';
import { UserPreference } from './user-preference.model.js';
import { UserProfile } from './user-profile.model.js';
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
export { EventOrganizer, ORGANIZER_PUBLIC_ATTRIBUTES } from './event-organizer.model.js';
export { Event } from './event.model.js';
export { OtpRequest } from './otp-request.model.js';
export { Report, type ReportEvidence } from './report.model.js';
export { SafetyLog } from './safety-log.model.js';
export { User, USER_PHONE_ATTRIBUTES } from './user.model.js';
export { UserPreference } from './user-preference.model.js';
export { UserProfile } from './user-profile.model.js';
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
];
