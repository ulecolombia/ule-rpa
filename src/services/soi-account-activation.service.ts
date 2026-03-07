/**
 * SOI Account Activation Service
 *
 * Coordina el flujo completo de creación y activación de cuentas SOI:
 *
 * 1. Usuario se registra en ULE
 * 2. RPA crea cuenta en SOI (registro.bot.ts)
 * 3. SOI envía email de activación a pagos.ule@gmail.com
 * 4. Este servicio lee el email (gmail-reader.service.ts)
 * 5. RPA activa la cuenta (activacion.bot.ts)
 * 6. Credenciales se guardan encriptadas en BD
 *
 * Puede ejecutarse como:
 * - Worker de BullMQ (procesando jobs de activación)
 * - Cron job (buscando emails pendientes periódicamente)
 * - Llamada directa (después de crear cuenta)
 */

import { getGmailReader, SOIActivationEmail } from './gmail-reader.service';
import { activarCuentaSOI, ActivationResult } from '../bots/soi/activacion.bot';
import { getSupabaseService } from './supabase.service';
import { encrypt } from '../utils/crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'soi-account-activation' });

/**
 * Resultado del procesamiento de activación
 */
export interface AccountActivationProcessResult {
  success: boolean;
  email?: SOIActivationEmail;
  activation?: ActivationResult;
  encryptedPassword?: string;
  message: string;
  error?: string;
}

/**
 * Datos de usuario para activación
 */
export interface PendingActivationUser {
  documento: string;
  tipoDocumento: string;
  nombreCompleto?: string;
  // Timestamp de cuando se creó la cuenta (para filtrar emails)
  createdAt?: Date;
}

/**
 * Servicio de activación de cuentas SOI
 */
export class SOIAccountActivationService {
  private gmailReader = getGmailReader();
  private supabase = getSupabaseService();
  private processing = new Set<string>(); // Documentos en proceso

  /**
   * Procesa la activación de una cuenta específica
   */
  async processActivation(user: PendingActivationUser): Promise<AccountActivationProcessResult> {
    const { documento } = user;

    // Evitar procesamiento duplicado
    if (this.processing.has(documento)) {
      return {
        success: false,
        message: 'Esta cuenta ya está siendo procesada',
        error: 'ALREADY_PROCESSING',
      };
    }

    this.processing.add(documento);

    try {
      logger.info('Starting activation process', { documento });

      // 1. Inicializar Gmail Reader
      const gmailInitialized = await this.gmailReader.initialize();
      if (!gmailInitialized) {
        return {
          success: false,
          message: 'No se pudo inicializar el lector de Gmail. Verificar credenciales.',
          error: 'GMAIL_NOT_INITIALIZED',
        };
      }

      // 2. Buscar email de activación
      logger.info('Searching for activation email', { documento });
      const activationEmail = await this.gmailReader.findActivationEmailForUser(documento);

      if (!activationEmail) {
        return {
          success: false,
          message: 'No se encontró email de activación para este usuario',
          error: 'EMAIL_NOT_FOUND',
        };
      }

      logger.info('Activation email found', {
        documento,
        messageId: activationEmail.messageId,
        subject: activationEmail.subject,
      });

      // 3. Verificar que tenemos el link de activación
      if (!activationEmail.activationLink) {
        return {
          success: false,
          email: activationEmail,
          message: 'El email no contiene un link de activación válido',
          error: 'NO_ACTIVATION_LINK',
        };
      }

      // 4. Activar la cuenta usando el bot
      logger.info('Activating account via bot', {
        documento,
        link: activationEmail.activationLink.substring(0, 50) + '...',
      });

      const activationResult = await activarCuentaSOI({
        activationLink: activationEmail.activationLink,
        numeroDocumento: documento,
        nombreCompleto: user.nombreCompleto,
      });

      // 5. Procesar resultado
      // Si la cuenta ya estaba activada (SEG-07014), retornar éxito sin password
      if (activationResult.accountActivated && !activationResult.generatedPassword) {
        logger.info('Account was already activated', { documento });
        return {
          success: true,
          email: activationEmail,
          activation: activationResult,
          message: activationResult.message || 'Cuenta ya estaba activada previamente',
        };
      }

      if (!activationResult.success || !activationResult.generatedPassword) {
        return {
          success: false,
          email: activationEmail,
          activation: activationResult,
          message: activationResult.message || 'Error durante la activación',
          error: activationResult.error,
        };
      }

      // 6. Encriptar la contraseña para almacenamiento
      logger.info('Encrypting password for storage', { documento });
      const encryptedPassword = await encrypt(activationResult.generatedPassword);

      // 7. Guardar credenciales en Supabase
      logger.info('Saving credentials to Supabase', { documento });
      try {
        // Buscar el user_id del usuario por su documento
        const user = await this.supabase.getUserByDocumento(documento);

        if (user) {
          // Guardar las credenciales SOI
          await this.supabase.saveSOICredentials(
            user.id,
            documento,
            encryptedPassword,
            true // verificado = true porque acabamos de activar
          );
          logger.info('Credentials saved to Supabase', { userId: user.id, documento });
        } else {
          logger.warn('User not found in Supabase, credentials not saved', { documento });
        }
      } catch (supabaseError) {
        // No fallar el proceso si Supabase falla, las credenciales están en el resultado
        logger.error('Failed to save credentials to Supabase', { documento, error: supabaseError });
      }

      // 8. Marcar el email como procesado
      await this.gmailReader.markAsRead(activationEmail.messageId);
      await this.gmailReader.addLabel(activationEmail.messageId, 'SOI-ACTIVADO');

      logger.info('Account activation successful', {
        documento,
        passwordLength: activationResult.generatedPassword.length,
      });

      return {
        success: true,
        email: activationEmail,
        activation: activationResult,
        encryptedPassword,
        message: 'Cuenta activada exitosamente',
      };
    } catch (error) {
      logger.error('Unexpected error during activation', { documento, error });
      return {
        success: false,
        message: 'Error inesperado durante la activación',
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      };
    } finally {
      this.processing.delete(documento);
    }
  }

  /**
   * Busca y procesa todos los emails de activación pendientes
   */
  async processAllPendingActivations(hoursBack: number = 24): Promise<{
    processed: number;
    successful: number;
    failed: number;
    results: AccountActivationProcessResult[];
  }> {
    logger.info('Processing all pending activations', { hoursBack });

    const results: AccountActivationProcessResult[] = [];
    let processed = 0;
    let successful = 0;
    let failed = 0;

    try {
      // Inicializar Gmail Reader
      const gmailInitialized = await this.gmailReader.initialize();
      if (!gmailInitialized) {
        logger.error('Gmail not initialized');
        return { processed: 0, successful: 0, failed: 0, results: [] };
      }

      // Buscar emails de activación recientes
      const searchResult = await this.gmailReader.findRecentActivationEmails(hoursBack);
      if (!searchResult.success || searchResult.emails.length === 0) {
        logger.info('No pending activation emails found');
        return { processed: 0, successful: 0, failed: 0, results: [] };
      }

      logger.info(`Found ${searchResult.emails.length} activation emails to process`);

      // Procesar cada email
      for (const email of searchResult.emails) {
        if (!email.numeroDocumento) {
          logger.warn('Email without documento number, skipping', { messageId: email.messageId });
          continue;
        }

        const result = await this.processActivation({
          documento: email.numeroDocumento,
          tipoDocumento: email.tipoDocumento || 'CC',
          nombreCompleto: email.nombreCompleto,
        });

        results.push(result);
        processed++;

        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        // Pequeña pausa entre procesamiento para evitar rate limits
        await this.sleep(2000);
      }
    } catch (error) {
      logger.error('Error processing pending activations', { error });
    }

    logger.info('Finished processing pending activations', {
      processed,
      successful,
      failed,
    });

    return { processed, successful, failed, results };
  }

  /**
   * Verifica si Gmail está configurado correctamente
   */
  async checkGmailSetup(): Promise<{
    configured: boolean;
    hasToken: boolean;
    authUrl?: string;
  }> {
    const configured = this.gmailReader.isConfigured();
    const hasToken = this.gmailReader.hasToken();

    if (!configured) {
      return { configured: false, hasToken: false };
    }

    if (!hasToken) {
      const authUrl = this.gmailReader.getAuthUrl();
      return { configured: true, hasToken: false, authUrl: authUrl || undefined };
    }

    return { configured: true, hasToken: true };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let activationServiceInstance: SOIAccountActivationService | null = null;

/**
 * Obtiene la instancia del servicio de activación
 */
export function getSOIAccountActivationService(): SOIAccountActivationService {
  if (!activationServiceInstance) {
    activationServiceInstance = new SOIAccountActivationService();
  }
  return activationServiceInstance;
}

export default SOIAccountActivationService;
