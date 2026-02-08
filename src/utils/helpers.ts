/**
 * Helper utilities for common operations
 */

/**
 * Sleep/delay utility
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry operation with exponential backoff
 * @param operation - Async operation to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 0.1 * delay;
      await sleep(delay + jitter);
    }
  }

  throw lastError!;
}

/**
 * Format currency in Colombian Pesos
 * @param amount - Amount in COP
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date for PILA period (YYYY-MM)
 * @param date - Date object or string
 */
export function formatPilaPeriod(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Parse PILA period to Date
 * @param period - Period string (YYYY-MM)
 */
export function parsePilaPeriod(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * Get current PILA period
 */
export function getCurrentPilaPeriod(): string {
  return formatPilaPeriod(new Date());
}

/**
 * Get previous PILA period
 */
export function getPreviousPilaPeriod(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return formatPilaPeriod(date);
}

/**
 * Validate Colombian document number (CC)
 * @param documento - Document number
 */
export function validateDocumento(documento: string): boolean {
  // Remove non-digits
  const clean = documento.replace(/\D/g, '');

  // CC should be 6-10 digits
  if (clean.length < 6 || clean.length > 10) {
    return false;
  }

  return /^\d+$/.test(clean);
}

/**
 * Format Colombian document number
 * @param documento - Document number
 */
export function formatDocumento(documento: string): string {
  const clean = documento.replace(/\D/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Calculate PILA contributions based on IBC
 * @param ibc - Ingreso Base de Cotización
 * @param nivelRiesgo - ARL risk level
 */
export function calculatePilaContributions(
  ibc: number,
  nivelRiesgo: 'I' | 'II' | 'III' | 'IV' | 'V' = 'I'
): {
  salud: number;
  pension: number;
  arl: number;
  total: number;
} {
  // Health: 12.5% of IBC (4% employee, 8.5% employer - independent pays both)
  const salud = Math.round(ibc * 0.125);

  // Pension: 16% of IBC (4% employee, 12% employer - independent pays both)
  const pension = Math.round(ibc * 0.16);

  // ARL: Based on risk level (percentage of IBC)
  const arlRates: Record<string, number> = {
    I: 0.00522,
    II: 0.01044,
    III: 0.02436,
    IV: 0.04350,
    V: 0.06960,
  };
  const arl = Math.round(ibc * arlRates[nivelRiesgo]);

  const total = salud + pension + arl;

  return { salud, pension, arl, total };
}

/**
 * Validate IBC (Ingreso Base de Cotización)
 * Must be between minimum wage and 25 times minimum wage
 * @param ibc - IBC value
 * @param salarioMinimo - Current minimum wage (2024: 1,300,000)
 */
export function validateIBC(ibc: number, salarioMinimo: number = 1300000): boolean {
  const min = salarioMinimo;
  const max = salarioMinimo * 25;
  return ibc >= min && ibc <= max;
}

/**
 * Chunk array into smaller arrays
 * @param array - Array to chunk
 * @param size - Chunk size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Remove duplicates from array
 * @param array - Array with duplicates
 * @param key - Optional key for objects
 */
export function unique<T>(array: T[], key?: keyof T): T[] {
  if (!key) {
    return [...new Set(array)];
  }

  const seen = new Set();
  return array.filter((item) => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

/**
 * Pick specific keys from object
 * @param obj - Source object
 * @param keys - Keys to pick
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Omit specific keys from object
 * @param obj - Source object
 * @param keys - Keys to omit
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => {
    delete result[key];
  });
  return result;
}

/**
 * Deep clone object (simple implementation)
 * For complex objects, consider using structuredClone or a library
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T = any>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number, suffix: string = '...'): string {
  if (str.length <= length) return str;
  return str.slice(0, length - suffix.length) + suffix;
}

/**
 * Generate random number between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get nested property from object safely
 * @param obj - Object to get property from
 * @param path - Dot-separated path (e.g., 'user.address.city')
 * @param defaultValue - Default value if path doesn't exist
 */
export function get<T = any>(obj: any, path: string, defaultValue?: T): T {
  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result == null) {
      return defaultValue as T;
    }
    result = result[key];
  }

  return result !== undefined ? result : (defaultValue as T);
}

/**
 * Debounce function
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function
 * @param fn - Function to throttle
 * @param limit - Minimum time between calls in milliseconds
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Calculate percentage
 */
export function percentage(value: number, total: number, decimals: number = 2): number {
  if (total === 0) return 0;
  return Number(((value / total) * 100).toFixed(decimals));
}

/**
 * Clamp number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
