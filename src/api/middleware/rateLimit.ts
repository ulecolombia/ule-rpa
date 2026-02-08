/**
 * Rate Limiting Middleware
 * Protects API from abuse
 */

import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Stricter rate limiter for task creation
 * 20 requests per 15 minutes per IP
 */
export const taskCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many task creation requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Webhook rate limiter
 * 50 requests per minute per IP
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  message: 'Too many webhook requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
