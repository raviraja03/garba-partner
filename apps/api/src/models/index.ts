import { UserPreference } from './user-preference.model.js';
import { UserProfile } from './user-profile.model.js';
import { UserSession } from './user-session.model.js';
import { UserVerification } from './user-verification.model.js';
import { User } from './user.model.js';

export { User, USER_PHONE_ATTRIBUTES } from './user.model.js';
export { UserPreference } from './user-preference.model.js';
export { UserProfile } from './user-profile.model.js';
export { UserSession } from './user-session.model.js';
export { UserVerification } from './user-verification.model.js';

/** Every model registered with the Sequelize instance. */
export const MODELS = [User, UserProfile, UserPreference, UserSession, UserVerification];
