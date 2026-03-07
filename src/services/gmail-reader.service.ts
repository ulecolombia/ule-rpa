/**
 * Gmail Reader Service
 *
 * Lee emails de activación de cuentas SOI desde pagos.ule@gmail.com
 * para automatizar el proceso de activación de cuentas.
 *
 * Flujo:
 * 1. Usuario se registra en SOI a través del RPA
 * 2. SOI envía email de activación a pagos.ule@gmail.com
 * 3. Este servicio lee el email y extrae el link de activación
 * 4. El RPA hace click en el link y crea la contraseña
 *
 * Requiere:
 * - Credenciales OAuth2 de Google Cloud Console (credentials.json)
 * - Token de acceso generado (token.json)
 * - Permisos de Gmail API: gmail.readonly
 */

import { google, gmail_v1 } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'gmail-reader' });

// Paths para credenciales
const CREDENTIALS_PATH = path.join(process.cwd(), 'config', 'gmail-credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'config', 'gmail-token.json');

// Scopes necesarios para leer emails
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// Remitente de emails de SOI
const SOI_EMAIL_SENDER = 'soportesoi@achcolombia.com.co';

/**
 * Información extraída de un email de activación SOI
 */
export interface SOIActivationEmail {
  messageId: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  // Datos del usuario extraídos del email
  tipoDocumento?: string;
  numeroDocumento: string;
  nombreCompleto?: string;
  // Link de activación
  activationLink: string;
  // HTML completo del email (para debugging)
  htmlBody?: string;
}

/**
 * Resultado de búsqueda de emails de activación
 */
export interface SearchActivationEmailsResult {
  success: boolean;
  emails: SOIActivationEmail[];
  error?: string;
}

/**
 * Clase para leer emails de Gmail
 */
export class GmailReaderService {
  private gmail: gmail_v1.Gmail | null = null;

  constructor() {
    // La inicialización se hace lazy cuando se necesita
  }

  /**
   * Verifica si las credenciales están configuradas
   */
  isConfigured(): boolean {
    return fs.existsSync(CREDENTIALS_PATH);
  }

  /**
   * Verifica si ya hay un token de acceso
   */
  hasToken(): boolean {
    return fs.existsSync(TOKEN_PATH);
  }

  /**
   * Inicializa el cliente de Gmail
   */
  async initialize(): Promise<boolean> {
    try {
      if (!this.isConfigured()) {
        logger.error('Gmail credentials not found', { path: CREDENTIALS_PATH });
        return false;
      }

      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

      // Use any for auth due to version mismatches in google-auth-library types
      const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      // Si ya existe un token, usarlo
      if (this.hasToken()) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
        oauth2Client.setCredentials(token);
        logger.info('Gmail API initialized with existing token');
      } else {
        logger.warn('No token found. Need to authorize first.');
        return false;
      }

      this.gmail = google.gmail({ version: 'v1', auth: oauth2Client as any });
      return true;
    } catch (error) {
      logger.error('Failed to initialize Gmail API', { error });
      return false;
    }
  }

  /**
   * Genera la URL de autorización para obtener el token inicial
   */
  getAuthUrl(): string | null {
    if (!this.isConfigured()) {
      logger.error('Cannot generate auth URL: credentials not found');
      return null;
    }

    try {
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

      const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
      });
    } catch (error) {
      logger.error('Failed to generate auth URL', { error });
      return null;
    }
  }

  /**
   * Intercambia el código de autorización por tokens
   */
  async authorizeWithCode(code: string): Promise<boolean> {
    try {
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

      const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Guardar el token
      const configDir = path.dirname(TOKEN_PATH);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      logger.info('Token stored successfully', { path: TOKEN_PATH });

      this.gmail = google.gmail({ version: 'v1', auth: oauth2Client as any });

      return true;
    } catch (error) {
      logger.error('Failed to authorize with code', { error });
      return false;
    }
  }

  /**
   * Busca emails de activación de SOI para un usuario específico
   */
  async findActivationEmailForUser(documento: string): Promise<SOIActivationEmail | null> {
    if (!this.gmail) {
      const initialized = await this.initialize();
      if (!initialized) {
        logger.error('Gmail API not initialized');
        return null;
      }
    }

    try {
      // Buscar emails de activación de SOI (sin documento en query)
      const query = `from:${SOI_EMAIL_SENDER} subject:"SOI - Activación de Usuario"`;

      logger.info('Searching for activation email', { documento, query });

      const response = await this.gmail!.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 20,
      });

      if (!response.data.messages || response.data.messages.length === 0) {
        logger.info('No activation emails found', { documento });
        return null;
      }

      // Buscar el email que contenga el documento en el cuerpo
      logger.info('Found emails to check', { count: response.data.messages.length });

      for (const msg of response.data.messages) {
        const message = await this.gmail!.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });

        const parsed = this.parseActivationEmail(message.data);
        logger.info('Parsed email', {
          messageId: msg.id,
          extractedDocumento: parsed?.numeroDocumento || 'NOT_FOUND',
          hasActivationLink: !!parsed?.activationLink,
          matchesTarget: parsed?.numeroDocumento === documento
        });

        if (parsed && parsed.numeroDocumento === documento) {
          logger.info('Found activation email for documento', { documento, messageId: msg.id });
          return parsed;
        }
      }

      logger.info('No activation email found matching documento', { documento });
      return null;
    } catch (error) {
      logger.error('Failed to find activation email', { documento, error });
      return null;
    }
  }

  /**
   * Busca todos los emails de activación de SOI recientes (últimas 24 horas)
   */
  async findRecentActivationEmails(hoursBack: number = 24): Promise<SearchActivationEmailsResult> {
    if (!this.gmail) {
      const initialized = await this.initialize();
      if (!initialized) {
        return {
          success: false,
          emails: [],
          error: 'Gmail API not initialized',
        };
      }
    }

    try {
      // Calcular fecha de inicio de búsqueda
      const afterDate = new Date();
      afterDate.setHours(afterDate.getHours() - hoursBack);
      const afterTimestamp = Math.floor(afterDate.getTime() / 1000);

      const query = `from:${SOI_EMAIL_SENDER} after:${afterTimestamp} subject:"SOI - Activación de Usuario"`;

      logger.info('Searching for recent activation emails', { query, hoursBack });

      const response = await this.gmail!.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50,
      });

      if (!response.data.messages || response.data.messages.length === 0) {
        logger.info('No recent activation emails found');
        return { success: true, emails: [] };
      }

      const emails: SOIActivationEmail[] = [];

      for (const msg of response.data.messages) {
        try {
          const message = await this.gmail!.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'full',
          });

          const parsed = this.parseActivationEmail(message.data);
          if (parsed) {
            emails.push(parsed);
          }
        } catch (parseError) {
          logger.warn('Failed to parse email', { messageId: msg.id, error: parseError });
        }
      }

      logger.info('Found activation emails', { count: emails.length });
      return { success: true, emails };
    } catch (error) {
      logger.error('Failed to search activation emails', { error });
      return {
        success: false,
        emails: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Parsea un mensaje de Gmail y extrae la información de activación
   */
  private parseActivationEmail(message: gmail_v1.Schema$Message): SOIActivationEmail | null {
    try {
      const headers = message.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('subject');
      const from = getHeader('from');
      const to = getHeader('to');
      const dateStr = getHeader('date');

      // Obtener el cuerpo HTML
      let htmlBody = '';
      const parts = message.payload?.parts || [];

      // El body puede estar en el payload directamente o en parts
      if (message.payload?.body?.data) {
        htmlBody = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      } else {
        for (const part of parts) {
          if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
            break;
          }
          // Revisar sub-partes
          if (part.parts) {
            for (const subPart of part.parts) {
              if (subPart.mimeType === 'text/html' && subPart.body?.data) {
                htmlBody = Buffer.from(subPart.body.data, 'base64').toString('utf-8');
                break;
              }
            }
          }
        }
      }

      // Extraer el link de activación
      // Buscar el href del botón "Activar mi cuenta"
      const activationLinkMatch = htmlBody.match(/href="(https?:\/\/[^"]*activar[^"]*|https?:\/\/soi\.com\.co[^"]*|https?:\/\/nuevosoi\.com\.co[^"]*)"/i)
        || htmlBody.match(/href="(https?:\/\/[^"]*)"[^>]*>[\s\S]*?Activar[\s\S]*?<\/a>/i);

      if (!activationLinkMatch) {
        // Buscar cualquier link de SOI
        const soiLinkMatch = htmlBody.match(/href="(https?:\/\/(?:www\.)?(?:nuevo)?soi\.com\.co[^"]*)"/i);
        if (!soiLinkMatch) {
          logger.warn('No activation link found in email', { messageId: message.id });
          return null;
        }
      }

      const activationLink = activationLinkMatch?.[1] || '';

      // Extraer número de documento del email
      // Nota: En HTML, ú puede estar codificado como &#250; o &uacute;
      // Patrones: "Número: XXXXXXXXXX", "N&#250;mero: XXXXXXXXXX", etc.
      const documentoMatch = htmlBody.match(/N(?:ú|u|&#250;|&uacute;)mero:\s*(\d+)/i)
        || htmlBody.match(/N(?:ú|u|&#250;|&uacute;)mero de documento:\s*(\d+)/i)
        || htmlBody.match(/[Cc](?:é|e|&#233;|&eacute;)dula[^:]*:\s*(\d+)/i)
        || htmlBody.match(/[Dd]ocumento[^:]*:\s*(\d+)/i);

      const numeroDocumento = documentoMatch?.[1] || '';

      // Extraer nombre completo
      const nombreMatch = htmlBody.match(/[Nn]ombre\s*completo:\s*([^<\n]+)/i)
        || htmlBody.match(/Hola,?\s*([^!<\n]+)/i);

      const nombreCompleto = nombreMatch?.[1]?.trim() || '';

      // Extraer tipo de documento
      const tipoDocMatch = htmlBody.match(/[Tt]ipo\s*de?\s*documento:\s*([^<\n]+)/i)
        || htmlBody.match(/Cédula\s*de\s*ciudadanía/i);

      const tipoDocumento = tipoDocMatch ?
        (tipoDocMatch[1]?.trim() || 'CC') : undefined;

      return {
        messageId: message.id || '',
        subject,
        from,
        to,
        date: new Date(dateStr),
        tipoDocumento,
        numeroDocumento,
        nombreCompleto,
        activationLink,
        htmlBody,
      };
    } catch (error) {
      logger.error('Failed to parse activation email', { error });
      return null;
    }
  }

  /**
   * Marca un email como leído
   */
  async markAsRead(messageId: string): Promise<boolean> {
    if (!this.gmail) {
      return false;
    }

    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
      return true;
    } catch (error) {
      logger.error('Failed to mark email as read', { messageId, error });
      return false;
    }
  }

  /**
   * Agrega una etiqueta al email (ej: "SOI-PROCESADO")
   */
  async addLabel(messageId: string, labelName: string): Promise<boolean> {
    if (!this.gmail) {
      return false;
    }

    try {
      // Primero verificar si la etiqueta existe o crearla
      const labelsResponse = await this.gmail.users.labels.list({ userId: 'me' });
      let labelId = labelsResponse.data.labels?.find(l => l.name === labelName)?.id;

      if (!labelId) {
        // Crear la etiqueta
        const createResponse = await this.gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: labelName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        });
        labelId = createResponse.data.id;
      }

      if (labelId) {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            addLabelIds: [labelId],
          },
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to add label to email', { messageId, labelName, error });
      return false;
    }
  }
}

// Singleton instance
let gmailReaderInstance: GmailReaderService | null = null;

/**
 * Obtiene la instancia del servicio de lectura de Gmail
 */
export function getGmailReader(): GmailReaderService {
  if (!gmailReaderInstance) {
    gmailReaderInstance = new GmailReaderService();
  }
  return gmailReaderInstance;
}

export default GmailReaderService;
