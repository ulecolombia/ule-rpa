import crypto from 'crypto';
import { promisify } from 'util';
import { config } from './config';

const scrypt = promisify(crypto.scrypt);

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Generate encryption key from password using scrypt
 * More secure than pbkdf2 for password-based encryption
 */
export async function generateKey(password: string, salt: string): Promise<Buffer> {
  return (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
}

/**
 * Get or generate application encryption key
 * Uses key from config or generates a deterministic one
 */
function getEncryptionKey(): Buffer {
  const key = config.encryption.key;
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt text using AES-256-GCM
 * Returns format: iv:tag:salt:encrypted
 *
 * @param text - Plain text to encrypt
 * @returns Encrypted string in format iv:tag:salt:encrypted
 *
 * @example
 * const encrypted = await encrypt('sensitive data');
 * const decrypted = await decrypt(encrypted);
 */
export async function encrypt(text: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await generateKey(config.encryption.key, salt.toString('hex'));
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Return: iv:tag:salt:encrypted
  return `${iv.toString('hex')}:${tag.toString('hex')}:${salt.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt text encrypted with encrypt()
 *
 * @param encryptedData - Encrypted string from encrypt()
 * @returns Decrypted plain text
 *
 * @throws Error if format is invalid or decryption fails
 */
export async function decrypt(encryptedData: string): Promise<string> {
  const parts = encryptedData.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format. Expected: iv:tag:salt:encrypted');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const salt = Buffer.from(parts[2], 'hex');
  const encrypted = parts[3];

  const key = await generateKey(config.encryption.key, salt.toString('hex'));

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Simple encryption for non-critical data (faster, no salt)
 * Use encrypt() for sensitive data
 */
export function encryptSimple(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Simple decryption for data encrypted with encryptSimple()
 */
export function decryptSimple(encryptedData: string): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Hash password using scrypt (for storage)
 * More secure than bcrypt or pbkdf2
 *
 * @param password - Plain text password
 * @returns Hashed password with salt in format: salt:hash
 */
export async function hash(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}

/**
 * Compare password with hash
 *
 * @param password - Plain text password to verify
 * @param hashedPassword - Hashed password from hash()
 * @returns True if password matches
 */
export async function compareHash(password: string, hashedPassword: string): Promise<boolean> {
  const [salt, hash] = hashedPassword.split(':');
  const hashBuffer = Buffer.from(hash, 'hex');
  const suppliedHashBuffer = (await scrypt(password, salt, 64)) as Buffer;
  return crypto.timingSafeEqual(hashBuffer, suppliedHashBuffer);
}

/**
 * One-way hash (for non-password data)
 * Use hash() for passwords
 */
export function hashSHA256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate HMAC signature for webhook verification
 *
 * @param payload - Data to sign
 * @param secret - Secret key
 * @returns Hex-encoded HMAC signature
 */
export function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify webhook signature using timing-safe comparison
 *
 * @param payload - Original payload
 * @param signature - Signature to verify
 * @param secret - Secret key
 * @returns True if signature is valid
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = sign(payload, secret);

  // Timing-safe comparison
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * Generate cryptographically secure random token
 *
 * @param length - Number of random bytes (output will be 2x in hex)
 * @returns Hex-encoded random token
 *
 * @example
 * const apiKey = generateToken(32); // 64 character hex string
 * const sessionId = generateToken(16); // 32 character hex string
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate URL-safe random token (base64url)
 *
 * @param length - Number of random bytes
 * @returns Base64url-encoded random token
 */
export function generateUrlSafeToken(length: number = 32): string {
  return crypto
    .randomBytes(length)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate random ID with prefix
 *
 * @param prefix - Prefix for the ID (e.g., 'task', 'user')
 * @param length - Length of random part
 * @returns ID in format: prefix_randomhex
 *
 * @example
 * generateId('task', 16) // 'task_a3f9e2c1b4d5...'
 * generateId('user', 12) // 'user_9f2e1c3b...'
 */
export function generateId(prefix: string, length: number = 16): string {
  const random = crypto.randomBytes(length).toString('hex');
  return `${prefix}_${random}`;
}

/**
 * Mask sensitive data for logging
 * Shows first and last N characters, masks the rest
 *
 * @param data - Sensitive string to mask
 * @param visibleChars - Number of visible characters at start/end
 * @returns Masked string
 *
 * @example
 * maskSensitive('1234567890', 2) // '12******90'
 * maskSensitive('secret-api-key', 3) // 'sec********key'
 */
export function maskSensitive(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) {
    return '*'.repeat(data.length);
  }

  const start = data.slice(0, visibleChars);
  const end = data.slice(-visibleChars);
  const masked = '*'.repeat(data.length - visibleChars * 2);

  return `${start}${masked}${end}`;
}

/**
 * Hash sensitive data for secure logging
 * Returns first 16 chars of SHA-256 hash (not reversible)
 *
 * @param data - Sensitive data to hash
 * @returns First 16 chars of SHA-256 hash
 *
 * @example
 * hashSensitiveData('123456') // 'e10adc3949ba59ab'
 */
export function hashSensitiveData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Validate encryption setup by encrypting and decrypting test data
 * Useful for startup checks
 *
 * @returns True if encryption is working correctly
 */
export async function validateEncryptionSetup(): Promise<boolean> {
  try {
    const testData = 'test-encryption-123456';
    const encrypted = await encrypt(testData);
    const decrypted = await decrypt(encrypted);

    const isValid = testData === decrypted;

    if (!isValid) {
      console.error('Encryption validation failed - decrypted data does not match');
    }

    return isValid;
  } catch (error) {
    console.error('Encryption validation failed', error);
    return false;
  }
}

/**
 * Encrypt password for SOI storage
 * Returns encrypted password and IV for storage in database
 *
 * @param password - Plain text password
 * @returns Object with encrypted password and IV
 *
 * @example
 * const { encrypted, iv } = encryptPassword('myPassword123');
 * // Store encrypted and iv in database
 */
export function encryptPassword(password: string): { encrypted: string; iv: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Format: tag:encrypted (IV stored separately)
  return {
    encrypted: `${tag.toString('hex')}:${encrypted}`,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt password for SOI use
 *
 * @param encrypted - Encrypted password (tag:encrypted format)
 * @param iv - IV used for encryption
 * @returns Decrypted plain text password
 */
export function decryptPassword(encrypted: string, iv: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');

  if (parts.length !== 2) {
    throw new Error('Invalid encrypted password format');
  }

  const tag = Buffer.from(parts[0], 'hex');
  const encryptedData = parts[1];
  const ivBuffer = Buffer.from(iv, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a secure random password for SOI accounts
 * Password requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 *
 * @param length - Length of the password (default 12)
 * @returns Secure random password
 *
 * @example
 * const password = generateSecurePassword(); // 'Kj9#mL2xQw1!'
 */
export function generateSecurePassword(length: number = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%&*';
  const allChars = uppercase + lowercase + numbers + special;

  // Ensure at least one of each type
  let password = '';
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];

  // Fill the rest with random characters
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Shuffle the password to avoid predictable patterns
  const shuffled = password
    .split('')
    .sort(() => crypto.randomInt(3) - 1)
    .join('');

  return shuffled;
}
