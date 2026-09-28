import { AdminSession } from './admin-session.model.js';
import { AdminUser } from './admin-user.model.js';
import { OtpRequest } from './otp-request.model.js';
import { UserPreference } from './user-preference.model.js';
import { UserProfile } from './user-profile.model.js';
import { UserSession } from './user-session.model.js';
import { UserVerification } from './user-verification.model.js';
import { User } from './user.model.js';

export { AdminSession } from './admin-session.model.js';
export { AdminUser } from './admin-user.model.js';
export { OtpRequest } from './otp-request.model.js';
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
];
