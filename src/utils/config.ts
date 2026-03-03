import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load environment variables
dotenv.config();

/**
 * Environment variables schema with validation
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  API_KEY: z.string().min(32, 'API_KEY must be at least 32 characters'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),

  // Enlace Operativo (Admin Account)
  ENLACE_BASE_URL: z.string().url('ENLACE_BASE_URL must be a valid URL'),
  ENLACE_ADMIN_DOC: z.string().min(1, 'ENLACE_ADMIN_DOC is required'),
  ENLACE_ADMIN_USER: z.string().optional().default(''), // Not used - Enlace uses doc + password only
  ENLACE_ADMIN_PASS: z.string().min(1, 'ENLACE_ADMIN_PASS is required'),

  // ULE API
  ULE_API_URL: z.string().url('ULE_API_URL must be a valid URL'),
  ULE_WEBHOOK_SECRET: z.string().min(16, 'ULE_WEBHOOK_SECRET must be at least 16 characters'),

  // Storage
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  STORAGE_PATH: z.string().default('./uploads'),
  STORAGE_BASE_URL: z.string().url('STORAGE_BASE_URL must be a valid URL'),

  // Puppeteer
  PUPPETEER_HEADLESS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  PUPPETEER_TIMEOUT: z.string().default('30000').transform(Number),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_DIR: z.string().default('./logs'),

  // Queue Configuration
  QUEUE_CONCURRENCY: z.string().default('1').transform(Number),
  QUEUE_MAX_RETRIES: z.string().default('3').transform(Number),

  // Encryption (for sensitive data)
  ENCRYPTION_KEY: z.string().optional(),

  // PSE Session Encryption (required for Fase 6)
  ENCRYPTION_SECRET: z
    .string()
    .min(32, 'ENCRYPTION_SECRET must be at least 32 characters')
    .optional(),

  // Bancolombia PSE Configuration (Fase 6)
  BANCOLOMBIA_CUENTA_NUMERO: z.string().optional(),
  BANCOLOMBIA_CUENTA_TIPO: z.enum(['Ahorros', 'Corriente']).default('Ahorros'),
  BANCOLOMBIA_TITULAR_DOCUMENTO: z.string().optional(),

  // SOI Configuration (New operator - no CAPTCHA)
  SOI_EMPRESA_TIPO_DOC: z.string().default('CC'),
  SOI_EMPRESA_NUMERO_DOC: z.string().optional(),
  SOI_USUARIO_TIPO_DOC: z.string().default('CC'),
  SOI_USUARIO_NUMERO_DOC: z.string().optional(),
  SOI_PASSWORD: z.string().optional(),

  // Operator Selection
  PILA_OPERATOR: z.enum(['enlace', 'soi']).default('soi'),
});

/**
 * Parse and validate environment variables
 */
function parseEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

const env = parseEnv();

/**
 * Application configuration
 * Typed and validated from environment variables
 */
export const config = {
  // Application
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  apiKey: env.API_KEY,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  // Database
  database: {
    url: env.DATABASE_URL,
  },

  // Redis
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    url: `redis://${env.REDIS_PASSWORD ? `:${env.REDIS_PASSWORD}@` : ''}${env.REDIS_HOST}:${env.REDIS_PORT}`,
  },

  // Enlace Operativo
  enlace: {
    baseUrl: env.ENLACE_BASE_URL,
    admin: {
      documento: env.ENLACE_ADMIN_DOC,
      username: env.ENLACE_ADMIN_USER,
      password: env.ENLACE_ADMIN_PASS,
    },
  },

  // ULE API
  ule: {
    apiUrl: env.ULE_API_URL,
    webhookSecret: env.ULE_WEBHOOK_SECRET,
  },

  // Storage
  storage: {
    type: env.STORAGE_TYPE,
    path: path.resolve(env.STORAGE_PATH),
    baseUrl: env.STORAGE_BASE_URL,
  },

  // Puppeteer
  puppeteer: {
    headless: env.PUPPETEER_HEADLESS,
    timeout: env.PUPPETEER_TIMEOUT,
    executablePath: env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  },

  // Logging
  logging: {
    level: env.LOG_LEVEL,
    dir: path.resolve(env.LOG_DIR),
  },

  // Queue
  queue: {
    concurrency: env.QUEUE_CONCURRENCY,
    maxRetries: env.QUEUE_MAX_RETRIES,
  },

  // Encryption
  encryption: {
    key: env.ENCRYPTION_KEY || 'default-key-please-change-in-production',
    secret: env.ENCRYPTION_SECRET || env.ENCRYPTION_KEY || 'default-secret-change-in-production-32chars',
  },

  // Bancolombia PSE (Fase 6)
  bancolombia: {
    cuentaNumero: env.BANCOLOMBIA_CUENTA_NUMERO,
    cuentaTipo: env.BANCOLOMBIA_CUENTA_TIPO,
    titularDocumento: env.BANCOLOMBIA_TITULAR_DOCUMENTO,
  },

  // SOI (New operator - no CAPTCHA)
  soi: {
    admin: {
      empresaTipoDoc: env.SOI_EMPRESA_TIPO_DOC,
      empresaNumeroDoc: env.SOI_EMPRESA_NUMERO_DOC || '',
      usuarioTipoDoc: env.SOI_USUARIO_TIPO_DOC,
      usuarioNumeroDoc: env.SOI_USUARIO_NUMERO_DOC || '',
      password: env.SOI_PASSWORD || '',
    },
  },

  // Operator Selection
  pilaOperator: env.PILA_OPERATOR,
} as const;

/**
 * Validate configuration on startup
 */
export function validateConfig() {
  console.log('✅ Configuration validated successfully');
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Database: ${config.database.url.split('@')[1] || 'configured'}`);
  console.log(`   Redis: ${config.redis.host}:${config.redis.port}`);
  console.log(`   Enlace: ${config.enlace.baseUrl}`);
  console.log(`   Log Level: ${config.logging.level}`);
}

/**
 * Export type for use in other modules
 */
export type Config = typeof config;
