/**
 * Session Events Service
 *
 * EventEmitter for communication between API endpoints and worker processes.
 * Used to notify bots when admin confirms payment in Bancolombia.
 */

import { EventEmitter } from 'events';

export const sessionEvents = new EventEmitter();
sessionEvents.setMaxListeners(100);

// Event types for type safety
export type SessionEventType =
  | `payment-confirmed:${string}`
  | `payment-cancelled:${string}`
  | `session-timeout:${string}`;
