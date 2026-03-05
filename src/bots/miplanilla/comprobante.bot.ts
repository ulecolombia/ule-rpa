/**
 * Mi Planilla Comprobante Bot
 * Maneja la descarga de comprobantes de pago PILA en Mi Planilla
 *
 * FASE 1 - Implementación completa del flujo de comprobantes
 *
 * Flujo:
 * 1. Autenticar en Mi Planilla
 * 2. Navegar a administrar planillas
 * 3. Buscar planilla por número
 * 4. Verificar que está PAGADA
 * 5. Descargar PDF del comprobante
 * 6. Capturar archivo descargado
 * 7. Retornar path del archivo
 */

import { Page } from 'puppeteer';
import { getMiPlanillaAuthBot, MiPlanillaAuthBot } from './auth.bot';
import {
  MIPLANILLA_URLS,
  MIPLANILLA_SELECTORS,
} from '../../types/miplanilla.types';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export interface MiPlanillaComprobanteDownloadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
  estadoPlanilla?: 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' | 'NO_ENCONTRADA';
}

export interface MiPlanillaComprobanteData {
  numeroPlanilla: string;
  uleUserId: string;
  periodo?: string;
  tipoDocumento: 'CC' | 'CE';
  documento: string;
  password: string;
}

export class MiPlanillaComprobanteBot {
  private authBot: MiPlanillaAuthBot;
  private downloadsPath: string;

  constructor() {
    this.authBot = getMiPlanillaAuthBot();
    this.downloadsPath = path.resolve('./downloads/comprobantes/miplanilla');
  }

  /**
   * Asegura que el directorio de descargas existe
   */
  private async ensureDownloadsDir(): Promise<void> {
    await fs.mkdir(this.downloadsPath, { recursive: true });
    logger.debug('Downloads directory ensured', { path: this.downloadsPath });
  }

  /**
   * Configura el comportamiento de descarga para la página
   */
  private async configureDownloads(page: Page): Promise<void> {
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: this.downloadsPath,
    });
    logger.debug('Download behavior configured', { path: this.downloadsPath });
  }

  /**
   * Espera a que un archivo aparezca en el directorio de descargas
   * Retorna el path del archivo cuando está completo (no .crdownload)
   */
  private async waitForDownload(
    timeoutMs: number = 30000,
    pollIntervalMs: number = 500
  ): Promise<string | null> {
    const startTime = Date.now();
    const initialFiles = new Set(await this.getDownloadedFiles());

    logger.info('Waiting for download...', {
      timeout: timeoutMs,
      initialFiles: initialFiles.size
    });

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      const currentFiles = await this.getDownloadedFiles();

      // Buscar archivos nuevos que no sean .crdownload (descarga en progreso)
      for (const file of currentFiles) {
        if (!initialFiles.has(file) && !file.endsWith('.crdownload')) {
          const filePath = path.join(this.downloadsPath, file);
          const stats = await fs.stat(filePath);

          // Verificar que el archivo tiene contenido
          if (stats.size > 0) {
            logger.info('Download completed', { file, size: stats.size });
            return filePath;
          }
        }
      }

      // Verificar si hay archivos .crdownload (descarga en progreso)
      const downloading = currentFiles.filter(f => f.endsWith('.crdownload'));
      if (downloading.length > 0) {
        logger.debug('Download in progress...', { files: downloading });
      }
    }

    logger.warn('Download timeout reached');
    return null;
  }

  /**
   * Lista archivos en el directorio de descargas
   */
  private async getDownloadedFiles(): Promise<string[]> {
    try {
      return await fs.readdir(this.downloadsPath);
    } catch {
      return [];
    }
  }

  /**
   * Toma screenshot para debugging
   */
  private async takeScreenshot(page: Page, name: string): Promise<string> {
    const screenshotsDir = './screenshots';
    await fs.mkdir(screenshotsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `miplanilla-comprobante-${name}_${timestamp}.png`;
    const filepath = path.join(screenshotsDir, filename);

    await page.screenshot({ path: filepath, fullPage: true });
    logger.debug('Screenshot saved', { filepath });
    return filepath;
  }

  /**
   * Verifica el estado de una planilla en Mi Planilla
   */
  async verificarEstadoPlanilla(
    numeroPlanilla: string,
    credentials: { tipoDocumento: 'CC' | 'CE'; documento: string; password: string }
  ): Promise<{
    estado: 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' | 'NO_ENCONTRADA';
    fechaPago?: Date;
    valorTotal?: number;
  }> {
    logger.info('Checking planilla status in Mi Planilla', { numeroPlanilla });

    // Login
    await this.authBot.login(credentials);
    const page = await this.authBot.getPage();

    if (!page) {
      return { estado: 'NO_ENCONTRADA' };
    }

    try {
      // Navegar a administrar planillas
      await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      // Buscar la planilla en la tabla
      const planillaInfo = await page.evaluate((numPlanilla) => {
        const rows = document.querySelectorAll('table tbody tr, .planilla-row, tr[data-planilla]');

        for (const row of rows) {
          const rowText = row.textContent || '';

          if (rowText.includes(numPlanilla)) {
            // Buscar estado en la fila
            const estadoCells = row.querySelectorAll('td');
            let estadoText = '';

            // El estado suele estar en una de las últimas columnas
            for (const cell of estadoCells) {
              const cellText = (cell.textContent || '').toLowerCase();
              if (cellText.includes('pagad') || cellText.includes('pendi') ||
                  cellText.includes('rechaz') || cellText.includes('venci')) {
                estadoText = cellText;
                break;
              }
            }

            if (!estadoText) {
              estadoText = rowText.toLowerCase();
            }

            let estado: string = 'NO_ENCONTRADA';
            if (estadoText.includes('pagad') || estadoText.includes('aprobad')) {
              estado = 'PAGADA';
            } else if (estadoText.includes('pendi') || estadoText.includes('liquidada')) {
              estado = 'PENDIENTE';
            } else if (estadoText.includes('rechaz') || estadoText.includes('fallid')) {
              estado = 'RECHAZADA';
            } else if (estadoText.includes('venci')) {
              estado = 'VENCIDA';
            }

            return { estado, found: true };
          }
        }

        return { estado: 'NO_ENCONTRADA', found: false };
      }, numeroPlanilla);

      return {
        estado: planillaInfo.estado as 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' | 'NO_ENCONTRADA',
      };
    } catch (error) {
      logger.error('Error checking planilla status in Mi Planilla', { error, numeroPlanilla });
      return { estado: 'NO_ENCONTRADA' };
    }
  }

  /**
   * Descarga el comprobante de una planilla pagada en Mi Planilla
   */
  async descargarComprobante(data: MiPlanillaComprobanteData): Promise<MiPlanillaComprobanteDownloadResult> {
    const { numeroPlanilla, uleUserId, periodo, tipoDocumento, documento, password } = data;

    logger.info('Starting comprobante download from Mi Planilla', {
      numeroPlanilla,
      uleUserId,
      periodo
    });

    await this.ensureDownloadsDir();

    // Login
    await this.authBot.login({ tipoDocumento, documento, password });
    const page = await this.authBot.getPage();

    if (!page) {
      return {
        success: false,
        error: 'Could not get authenticated page',
        estadoPlanilla: 'NO_ENCONTRADA',
      };
    }

    await this.configureDownloads(page);

    try {
      // PASO 1: Navegar a administrar planillas
      logger.info('Step 1: Navigating to administrar planillas');
      await page.goto(MIPLANILLA_URLS.administrarPlanillas, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      await this.takeScreenshot(page, `01-administrar-${numeroPlanilla}`);

      // PASO 2: Buscar la planilla y verificar estado
      logger.info('Step 2: Finding planilla');

      const planillaFound = await page.evaluate((numPlanilla) => {
        const rows = document.querySelectorAll('table tbody tr, .planilla-row');

        for (const row of rows) {
          const rowText = row.textContent || '';

          if (rowText.includes(numPlanilla)) {
            // Verificar si está pagada
            const isPagada = rowText.toLowerCase().includes('pagad');
            return { found: true, isPagada };
          }
        }

        return { found: false, isPagada: false };
      }, numeroPlanilla);

      if (!planillaFound.found) {
        return {
          success: false,
          error: 'Planilla not found in Mi Planilla',
          estadoPlanilla: 'NO_ENCONTRADA',
        };
      }

      if (!planillaFound.isPagada) {
        return {
          success: false,
          error: 'Planilla is not PAGADA',
          estadoPlanilla: 'PENDIENTE',
        };
      }

      // PASO 3: Buscar y hacer click en descargar comprobante
      logger.info('Step 3: Finding download button for planilla');

      const downloadClicked = await page.evaluate((numPlanilla) => {
        const rows = document.querySelectorAll('table tbody tr, .planilla-row');

        for (const row of rows) {
          const rowText = row.textContent || '';

          if (rowText.includes(numPlanilla)) {
            // Buscar varios tipos de botones de descarga
            const downloadSelectors = [
              'a[href*="comprobante"]',
              'a[href*="soporte"]',
              'a[href*="download"]',
              'a[href*=".pdf"]',
              'button[title*="Descargar"]',
              'button[title*="Comprobante"]',
              'a[title*="Descargar"]',
              'a[title*="Comprobante"]',
              'img[src*="download"]',
              'img[src*="pdf"]',
              'img[alt*="PDF"]',
              '.btn-download',
              '[class*="download"]',
              '[class*="comprobante"]',
              'a[onclick*="descargar"]',
              'a[onclick*="comprobante"]',
            ];

            for (const selector of downloadSelectors) {
              const btn = row.querySelector(selector) as HTMLElement;
              if (btn) {
                btn.click();
                return { clicked: true, selector };
              }
            }

            // Buscar cualquier link que parezca de descarga
            const links = row.querySelectorAll('a, button');
            for (const link of links) {
              const text = (link.textContent || '').toLowerCase();
              const title = link.getAttribute('title')?.toLowerCase() || '';
              const href = link.getAttribute('href') || '';

              if (text.includes('descargar') || text.includes('pdf') ||
                  text.includes('soporte') || text.includes('comprobante') ||
                  title.includes('descargar') || title.includes('comprobante') ||
                  href.includes('.pdf') || href.includes('download')) {
                (link as HTMLElement).click();
                return { clicked: true, selector: 'link-text-match' };
              }
            }
          }
        }

        return { clicked: false, selector: null };
      }, numeroPlanilla);

      if (!downloadClicked.clicked) {
        await this.takeScreenshot(page, `error-no-download-btn-${numeroPlanilla}`);
        return {
          success: false,
          error: 'Could not find download button for planilla comprobante',
          estadoPlanilla: 'PAGADA',
        };
      }

      logger.info('Download button clicked', { selector: downloadClicked.selector });
      await this.takeScreenshot(page, `02-clicked-download-${numeroPlanilla}`);

      // PASO 4: Esperar a que se descargue el archivo
      logger.info('Step 4: Waiting for file download');
      const downloadedFilePath = await this.waitForDownload(45000);

      if (!downloadedFilePath) {
        await this.takeScreenshot(page, `error-download-timeout-${numeroPlanilla}`);
        return {
          success: false,
          error: 'Download timeout - file did not appear in downloads folder',
          estadoPlanilla: 'PAGADA',
        };
      }

      // PASO 5: Verificar y renombrar el archivo
      logger.info('Step 5: Verifying downloaded file');
      const stats = await fs.stat(downloadedFilePath);

      // Crear nombre estructurado para el archivo
      const periodoStr = periodo || new Date().toISOString().slice(0, 7);
      const newFileName = `comprobante_miplanilla_${numeroPlanilla}_${uleUserId}_${periodoStr}.pdf`;
      const newFilePath = path.join(this.downloadsPath, newFileName);

      // Renombrar si es necesario
      if (downloadedFilePath !== newFilePath) {
        await fs.rename(downloadedFilePath, newFilePath);
        logger.info('File renamed', { from: downloadedFilePath, to: newFilePath });
      }

      logger.info('Comprobante downloaded successfully from Mi Planilla', {
        filePath: newFilePath,
        fileSize: stats.size,
        numeroPlanilla,
      });

      return {
        success: true,
        filePath: newFilePath,
        fileName: newFileName,
        fileSize: stats.size,
        estadoPlanilla: 'PAGADA',
      };

    } catch (error) {
      logger.error('Error downloading comprobante from Mi Planilla', {
        error: error instanceof Error ? error.message : error,
        numeroPlanilla
      });
      await this.takeScreenshot(page, `error-exception-${numeroPlanilla}`);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
        estadoPlanilla: 'PAGADA',
      };
    }
  }
}

// Singleton instance
let comprobanteBot: MiPlanillaComprobanteBot | null = null;

export function getMiPlanillaComprobanteBot(): MiPlanillaComprobanteBot {
  if (!comprobanteBot) {
    comprobanteBot = new MiPlanillaComprobanteBot();
  }
  return comprobanteBot;
}

/**
 * Función helper para descargar comprobante de Mi Planilla
 */
export async function descargarComprobanteMiPlanilla(
  data: MiPlanillaComprobanteData
): Promise<MiPlanillaComprobanteDownloadResult> {
  const bot = getMiPlanillaComprobanteBot();
  return bot.descargarComprobante(data);
}

/**
 * Función helper para verificar estado de planilla en Mi Planilla
 */
export async function verificarEstadoPlanillaMiPlanilla(
  numeroPlanilla: string,
  credentials: { tipoDocumento: 'CC' | 'CE'; documento: string; password: string }
): Promise<{
  estado: 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' | 'NO_ENCONTRADA';
}> {
  const bot = getMiPlanillaComprobanteBot();
  return bot.verificarEstadoPlanilla(numeroPlanilla, credentials);
}
