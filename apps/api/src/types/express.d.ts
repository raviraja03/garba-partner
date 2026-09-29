import type { AdminAuthContext, MemberAuthContext } from '../middlewares/authenticate.js';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated member (set by the member authentication middleware). */
      auth?: MemberAuthContext;
      /** Authenticated admin (set by the admin authentication middleware). */
      admin?: AdminAuthContext;
      /** Raw request body, kept only for signed webhooks (Razorpay). */
      rawBody?: Buffer;
    }
  }
}

export {};
