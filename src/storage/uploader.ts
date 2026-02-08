import { PrismaClient } from '@prisma/client';
import { localStorage } from './local';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export async function uploadTaskFile(
  taskId: string,
  file: Buffer,
  filename: string,
  fileType: string
): Promise<string> {
  try {
    // Save file to storage
    const filePath = await localStorage.saveFile(file, filename, `tasks/${taskId}`);
    const fileUrl = localStorage.getPublicUrl(filePath);
    const fileSize = file.length;

    // Create TaskFile record
    await prisma.taskFile.create({
      data: {
        taskId,
        fileName: filename,
        fileType,
        filePath,
        fileUrl,
        fileSize,
      },
    });

    logger.info(`Task file uploaded: ${filename} for task ${taskId}`);
    return fileUrl;
  } catch (error) {
    logger.error('Error uploading task file:', error);
    throw error;
  }
}

export async function getTaskFiles(taskId: string) {
  return await prisma.taskFile.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteTaskFile(fileId: string): Promise<void> {
  try {
    const file = await prisma.taskFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    // Delete from storage
    await localStorage.deleteFile(file.filePath);

    // Delete from database
    await prisma.taskFile.delete({
      where: { id: fileId },
    });

    logger.info(`Task file deleted: ${fileId}`);
  } catch (error) {
    logger.error('Error deleting task file:', error);
    throw error;
  }
}

// ============================================================================
// FASE 4.3 - SERVICIO DE ALMACENAMIENTO DE COMPROBANTES
// ============================================================================

import fs from 'fs/promises';
import path from 'path';
import { config } from '../utils/config';

/**
 * Resultado de upload de comprobante
 */
export interface UploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  error?: string;
}

/**
 * Metadata del comprobante
 */
export interface ComprobanteMetadata {
  userId: string;
  numeroPlanilla: string;
  periodo: string;
  valor: number;
  fechaPago: Date;
}

/**
 * Servicio de almacenamiento de comprobantes
 * Soporta múltiples backends: local, Vercel Blob, AWS S3
 */
export class StorageUploader {
  private storageType: 'local' | 'vercel-blob' | 's3';

  constructor() {
    this.storageType = (process.env.STORAGE_TYPE || 'local') as any;
    logger.info('StorageUploader initialized', { storageType: this.storageType });
  }

  /**
   * Sube un comprobante al storage configurado
   *
   * @param localPath - Path local del archivo descargado
   * @param metadata - Metadata del comprobante (userId, planilla, periodo, etc.)
   * @returns Resultado con URL pública del archivo
   *
   * @example
   * const result = await uploader.uploadComprobante(
   *   './downloads/comprobante_123.pdf',
   *   {
   *     userId: 'user-123',
   *     numeroPlanilla: '123456789',
   *     periodo: '2026-02',
   *     valor: 580440,
   *     fechaPago: new Date()
   *   }
   * );
   * if (result.success) {
   *   console.log('URL pública:', result.url);
   * }
   */
  async uploadComprobante(
    localPath: string,
    metadata: ComprobanteMetadata
  ): Promise<UploadResult> {
    logger.info('Uploading comprobante', {
      localPath,
      userId: metadata.userId,
      numeroPlanilla: metadata.numeroPlanilla,
      storageType: this.storageType,
    });

    try {
      // 1. Verificar que archivo existe
      const stats = await fs.stat(localPath);

      if (stats.size === 0) {
        throw new Error('File is empty');
      }

      logger.info('File verified', { size: stats.size, path: localPath });

      // 2. Generar path estructurado
      // Estructura: comprobantes/{userId}/pila/{año}/{mes}/comprobante_{numero}.pdf
      const [anio, mes] = metadata.periodo.split('-');
      const remotePath = `comprobantes/${metadata.userId}/pila/${anio}/${mes}/comprobante_${metadata.numeroPlanilla}.pdf`;

      logger.info('Remote path generated', { remotePath });

      // 3. Upload según el tipo de storage
      let result: UploadResult;

      switch (this.storageType) {
        case 'local':
          result = await this.uploadToLocal(localPath, remotePath);
          break;

        case 'vercel-blob':
          result = await this.uploadToVercelBlob(localPath, remotePath, metadata);
          break;

        case 's3':
          result = await this.uploadToS3(localPath, remotePath, metadata);
          break;

        default:
          throw new Error(`Unknown storage type: ${this.storageType}`);
      }

      if (result.success) {
        logger.info('✅ Comprobante uploaded successfully', {
          url: result.url,
          publicId: result.publicId,
          userId: metadata.userId,
          numeroPlanilla: metadata.numeroPlanilla,
        });
      }

      return result;
    } catch (error) {
      logger.error('❌ Error uploading comprobante', {
        localPath,
        metadata,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Upload a directorio local (para desarrollo)
   */
  private async uploadToLocal(
    localPath: string,
    remotePath: string
  ): Promise<UploadResult> {
    logger.info('Uploading to local storage', { remotePath });

    const basePath = process.env.STORAGE_PATH || './uploads';
    const fullPath = path.join(basePath, remotePath);

    // Crear directorios
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    logger.info('Directory created', { dir: path.dirname(fullPath) });

    // Copiar archivo
    await fs.copyFile(localPath, fullPath);
    logger.info('File copied', { from: localPath, to: fullPath });

    // URL pública (asumiendo servidor estático)
    const baseUrl = process.env.STORAGE_BASE_URL || 'http://localhost:3001/files';
    const url = `${baseUrl}/${remotePath}`;

    return {
      success: true,
      url,
      publicId: remotePath,
    };
  }

  /**
   * Upload a Vercel Blob Storage
   * Requiere: npm install @vercel/blob
   * Variables de entorno: BLOB_READ_WRITE_TOKEN
   */
  private async uploadToVercelBlob(
    localPath: string,
    remotePath: string,
    metadata: ComprobanteMetadata
  ): Promise<UploadResult> {
    logger.info('Uploading to Vercel Blob', { remotePath });

    try {
      // Requiere: @vercel/blob
      const { put } = await import('@vercel/blob');

      const fileBuffer = await fs.readFile(localPath);
      logger.info('File read for Vercel Blob', { size: fileBuffer.length });

      const blob = await put(remotePath, fileBuffer, {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/pdf',
      });

      logger.info('Vercel Blob upload successful', { url: blob.url });

      return {
        success: true,
        url: blob.url,
        publicId: remotePath,
      };
    } catch (error) {
      logger.error('Error uploading to Vercel Blob', { error });

      // Si falla porque no está instalado @vercel/blob
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        throw new Error(
          'Vercel Blob SDK not installed. Run: npm install @vercel/blob'
        );
      }

      throw error;
    }
  }

  /**
   * Upload a AWS S3
   * Requiere: npm install @aws-sdk/client-s3
   * Variables de entorno:
   * - AWS_REGION
   * - AWS_ACCESS_KEY_ID
   * - AWS_SECRET_ACCESS_KEY
   * - AWS_S3_BUCKET
   */
  private async uploadToS3(
    localPath: string,
    remotePath: string,
    metadata: ComprobanteMetadata
  ): Promise<UploadResult> {
    logger.info('Uploading to AWS S3', { remotePath });

    try {
      // Requiere: @aws-sdk/client-s3
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

      // Validar variables de entorno
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('AWS credentials not configured');
      }

      if (!process.env.AWS_S3_BUCKET) {
        throw new Error('AWS_S3_BUCKET not configured');
      }

      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      const fileBuffer = await fs.readFile(localPath);
      logger.info('File read for S3', { size: fileBuffer.length });

      const bucketName = process.env.AWS_S3_BUCKET;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: remotePath,
        Body: fileBuffer,
        ContentType: 'application/pdf',
        Metadata: {
          userId: metadata.userId,
          numeroPlanilla: metadata.numeroPlanilla,
          periodo: metadata.periodo,
          valor: metadata.valor.toString(),
          fechaPago: metadata.fechaPago.toISOString(),
        },
      });

      await s3Client.send(command);

      // URL pública (asumiendo bucket público)
      // Ajustar según configuración de CloudFront si se usa
      const url = `https://${bucketName}.s3.amazonaws.com/${remotePath}`;

      logger.info('S3 upload successful', { url });

      return {
        success: true,
        url,
        publicId: remotePath,
      };
    } catch (error) {
      logger.error('Error uploading to S3', { error });

      // Si falla porque no está instalado @aws-sdk/client-s3
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        throw new Error('AWS SDK not installed. Run: npm install @aws-sdk/client-s3');
      }

      throw error;
    }
  }

  /**
   * Elimina archivo local después de subir exitosamente
   *
   * @param localPath - Path del archivo a eliminar
   *
   * @example
   * await uploader.cleanupLocalFile('./downloads/comprobante_123.pdf');
   */
  async cleanupLocalFile(localPath: string): Promise<void> {
    try {
      await fs.unlink(localPath);
      logger.info('Local file cleaned up', { localPath });
    } catch (error) {
      logger.warn('Could not delete local file', {
        localPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Singleton instance del uploader
 */
export const storageUploader = new StorageUploader();

/**
 * Helper function para upload + cleanup
 *
 * @param localPath - Path local del comprobante
 * @param metadata - Metadata del comprobante
 * @param cleanup - Si debe eliminar archivo local (default: true)
 * @returns Resultado del upload
 *
 * @example
 * const result = await uploadComprobanteToStorage(
 *   './downloads/comprobante_123.pdf',
 *   { userId: 'user-123', numeroPlanilla: '123456789', ... },
 *   true // cleanup después
 * );
 */
export async function uploadComprobanteToStorage(
  localPath: string,
  metadata: ComprobanteMetadata,
  cleanup: boolean = true
): Promise<UploadResult> {
  const result = await storageUploader.uploadComprobante(localPath, metadata);

  // Cleanup solo si upload fue exitoso y cleanup está habilitado
  if (result.success && cleanup) {
    await storageUploader.cleanupLocalFile(localPath);
  }

  return result;
}
