/**
 * Simple circuit breaker for external services (SOI, Mi Planilla).
 * Tracks consecutive failures and pauses retries with exponential backoff + jitter.
 */

import { logger } from '../utils/logger';

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuits: Map<string, CircuitState> = new Map();

const MAX_FAILURES = 3;
const BASE_COOLDOWN_MS = 30_000; // 30s
const MAX_COOLDOWN_MS = 5 * 60_000; // 5 min

function getState(service: string): CircuitState {
  if (!circuits.has(service)) {
    circuits.set(service, { failures: 0, lastFailure: 0, isOpen: false });
  }
  return circuits.get(service)!;
}

/**
 * Check if service is available. Throws if circuit is open and cooldown hasn't elapsed.
 */
export function checkCircuit(service: string): void {
  const state = getState(service);
  if (!state.isOpen) return;

  const cooldown = Math.min(
    BASE_COOLDOWN_MS * Math.pow(2, state.failures - MAX_FAILURES),
    MAX_COOLDOWN_MS
  );
  const jitter = Math.random() * 5000;
  const elapsed = Date.now() - state.lastFailure;

  if (elapsed < cooldown + jitter) {
    const waitSec = Math.round((cooldown + jitter - elapsed) / 1000);
    throw new Error(
      `Circuit breaker OPEN for ${service}: ${state.failures} consecutive failures. Retry in ~${waitSec}s`
    );
  }

  // Cooldown elapsed — allow a probe attempt (half-open)
  logger.info(`[CircuitBreaker] ${service}: half-open, allowing probe attempt`);
}

/**
 * Record a successful call — resets the circuit.
 */
export function recordSuccess(service: string): void {
  const state = getState(service);
  if (state.failures > 0) {
    logger.info(`[CircuitBreaker] ${service}: reset after success (was at ${state.failures} failures)`);
  }
  state.failures = 0;
  state.isOpen = false;
  state.lastFailure = 0;
}

/**
 * Record a failed call — may open the circuit.
 */
export function recordFailure(service: string): void {
  const state = getState(service);
  state.failures++;
  state.lastFailure = Date.now();

  if (state.failures >= MAX_FAILURES) {
    state.isOpen = true;
    logger.warn(`[CircuitBreaker] ${service}: OPEN after ${state.failures} consecutive failures`);
  }
}
