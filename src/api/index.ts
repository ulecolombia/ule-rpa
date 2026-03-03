/**
 * API Module
 * Exports Express app and middleware
 */

export { default as app } from './server';
export { authMiddleware } from './middleware/auth';
export {
  adminAuthMiddleware,
  adminReadOnlyMiddleware,
  adminAuditMiddleware,
} from './middleware/adminAuth';
export { errorMiddleware } from './middleware/error';
export { apiLimiter, taskCreationLimiter, webhookLimiter } from './middleware/rateLimit';
