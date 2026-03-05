/**
 * SOI Comprobante Bot
 * Maneja la descarga de comprobantes de pago PILA en SOI
 *
 * FASE 1 - Implementación completa del flujo de comprobantes
 *
 * Flujo:
 * 1. Autenticar en SOI
 * 2. Navegar a consulta de planillas/soportes
 * 3. Buscar planilla por número
 * 4. Verificar que está PAGADA
 * 5. Descargar PDF del comprobante
 * 6. Capturar archivo descargado
 * 7. Retornar path del archivo
 */

import { Page } from 'puppeteer';
import { getSOIAuthBot, SOIAuthBot } from './auth.bot';
import { SOI_SELECTORS } from './selectors';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export interface ComprobanteDownloadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
  estadoPlanilla?: 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' | 'NO_ENCONTRADA';
}

export interface ComprobanteData {
  numeroPlanilla: string;
  uleUserId: string;
  periodo?: string;
}

export class SOIComprobanteBot {
  private authBot: SOIAuthBot;
  private downloadsPath: string;

  constructor() {
    this.authBot = getSOIAuthBot();
    this.downloadsPath = path.resolve('./downloads/comprobantes');
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
    const filename = `comprobante-${name}_${timestamp}.png`;
    const filepath = path.join(screenshotsDir, filename);

    await page.screenshot({ path: filepath, fullPage: true });
    logger.debug('Screenshot saved', { filepath });
    return filepath;
  }

  /**
   * Verifica el estado de una planilla
   */
  async verificarEstadoPlanilla(numeroPlanilla: string): Promise<{
    estado: 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' | 'NO_ENCONTRADA';
    fechaPago?: Date;
    valorTotal?: number;
  }> {
    logger.info('Checking planilla status', { numeroPlanilla });

    const page = await this.authBot.ensureAuthenticated();

    try {
      // Navegar a consulta de planillas
      const consultaUrl = SOI_SELECTORS.URLS.CONSULTAR_PLANILLAS ||
        SOI_SELECTORS.URLS.BASE + '/consultarPlanillas.do';

      await page.goto(consultaUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      // Buscar la planilla en la tabla
      const planillaInfo = await page.evaluate((numPlanilla) => {
        const rows = document.querySelectorAll('table tbody tr, .planilla-row, tr[data-planilla]');

        for (const row of rows) {
          const rowText = row.textContent || '';

          if (rowText.includes(numPlanilla)) {
            // Buscar estado en la fila
            const estadoCell = row.querySelector('.estado, td:last-child, [class*="estado"]');
            const estadoText = (estadoCell?.textContent || rowText).toLowerCase();

            let estado: string = 'NO_ENCONTRADA';
            if (estadoText.includes('pagad') || estadoText.includes('aprobad')) {
              estado = 'PAGADA';
            } else if (estadoText.includes('pendiente') || estadoText.includes('liquidada')) {
              estado = 'PENDIENTE';
            } else if (estadoText.includes('rechazad') || estadoText.includes('fallid')) {
              estado = 'RECHAZADA';
            } else if (estadoText.includes('vencid')) {
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
      logger.error('Error checking planilla status', { error, numeroPlanilla });
      return { estado: 'NO_ENCONTRADA' };
    }
  }

  /**
   * Descarga el comprobante de una planilla pagada
   */
  async descargarComprobante(data: ComprobanteData): Promise<ComprobanteDownloadResult> {
    const { numeroPlanilla, uleUserId, periodo } = data;

    logger.info('Starting comprobante download', {
      numeroPlanilla,
      uleUserId,
      periodo
    });

    await this.ensureDownloadsDir();
    const page = await this.authBot.ensureAuthenticated();
    await this.configureDownloads(page);

    try {
      // PASO 1: Verificar estado de la planilla
      logger.info('Step 1: Checking planilla status');
      const estadoResult = await this.verificarEstadoPlanilla(numeroPlanilla);

      if (estadoResult.estado === 'NO_ENCONTRADA') {
        return {
          success: false,
          error: 'Planilla not found in SOI',
          estadoPlanilla: 'NO_ENCONTRADA',
        };
      }

      if (estadoResult.estado !== 'PAGADA') {
        return {
          success: false,
          error: `Planilla is not PAGADA, current status: ${estadoResult.estado}`,
          estadoPlanilla: estadoResult.estado,
        };
      }

      // PASO 2: Navegar a soportes de pago o comprobantes
      logger.info('Step 2: Navigating to payment receipts');
      const soportesUrl = SOI_SELECTORS.URLS.SOPORTES_PAGO ||
        SOI_SELECTORS.URLS.BASE + '/soportesPago.do';

      await page.goto(soportesUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      await page.waitForTimeout(2000);
      await this.takeScreenshot(page, `01-soportes-${numeroPlanilla}`);

      // PASO 3: Buscar y hacer click en descargar
      logger.info('Step 3: Finding download button for planilla');

      const downloadClicked = await page.evaluate((numPlanilla) => {
        const rows = document.querySelectorAll('table tbody tr, .planilla-row');

        for (const row of rows) {
          const rowText = row.textContent || '';

          if (rowText.includes(numPlanilla)) {
            // Buscar varios tipos de botones de descarga
            const downloadSelectors = [
              'a[href*="download"]',
              'a[href*="comprobante"]',
              'a[href*="soporte"]',
              'a[href*=".pdf"]',
              'button[title*="Descargar"]',
              'img[src*="download"]',
              'img[src*="pdf"]',
              'a:has(img[src*="pdf"])',
              '.btn-download',
              '[class*="download"]',
              'a[onclick*="descargar"]',
              'a[onclick*="download"]',
            ];

            for (const selector of downloadSelectors) {
              const btn = row.querySelector(selector) as HTMLElement;
              if (btn) {
                btn.click();
                return { clicked: true, selector };
              }
            }

            // Buscar cualquier link que parezca de descarga
            const links = row.querySelectorAll('a');
            for (const link of links) {
              const text = (link.textContent || '').toLowerCase();
              const href = link.getAttribute('href') || '';
              if (text.includes('descargar') || text.includes('pdf') ||
                  text.includes('soporte') || text.includes('comprobante') ||
                  href.includes('.pdf') || href.includes('download')) {
                (link as HTMLElement).click();
                return { clicked: true, selector: 'link-text' };
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
          error: 'Could not find download button for planilla',
          estadoPlanilla: 'PAGADA',
        };
      }

      logger.info('Download button clicked', { selector: downloadClicked.selector });
      await this.takeScreenshot(page, `02-clicked-download-${numeroPlanilla}`);

      // PASO 4: Esperar a que se descargue el archivo
      logger.info('Step 4: Waiting for file download');
      const downloadedFilePath = await this.waitForDownload(45000);

      if (!downloadedFilePath) {
        // Intentar verificar si se abrió en nueva pestaña o iframe
        const pages = await page.browser()?.pages();
        if (pages && pages.length > 1) {
          logger.info('Checking other tabs for PDF...');
          // Podría ser que el PDF se abrió en otra pestaña
        }

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
      const newFileName = `comprobante_${numeroPlanilla}_${uleUserId}_${periodoStr}.pdf`;
      const newFilePath = path.join(this.downloadsPath, newFileName);

      // Renombrar si es necesario
      if (downloadedFilePath !== newFilePath) {
        await fs.rename(downloadedFilePath, newFilePath);
        logger.info('File renamed', { from: downloadedFilePath, to: newFilePath });
      }

      logger.info('Comprobante downloaded successfully', {
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
      logger.error('Error downloading comprobante', {
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
let comprobanteBot: SOIComprobanteBot | null = null;

export function getSOIComprobanteBot(): SOIComprobanteBot {
  if (!comprobanteBot) {
    comprobanteBot = new SOIComprobanteBot();
  }
  return comprobanteBot;
}

/**
 * Función helper para descargar comprobante
 */
export async function descargarComprobanteSOI(
  data: ComprobanteData
): Promise<ComprobanteDownloadResult> {
  const bot = getSOIComprobanteBot();
  return bot.descargarComprobante(data);
}

/**
 * Función helper para verificar estado de planilla
 */
export async function verificarEstadoPlanillaSOI(
  numeroPlanilla: string
): Promise<{
  estado: 'PENDIENTE' | 'PAGADA' | 'RECHAZADA' | 'VENCIDA' | 'NO_ENCONTRADA';
}> {
  const bot = getSOIComprobanteBot();
  return bot.verificarEstadoPlanilla(numeroPlanilla);
}
