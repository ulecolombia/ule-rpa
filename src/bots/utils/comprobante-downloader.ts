/**
 * Comprobante Downloader Module
 *
 * Módulo utilitario para descargar comprobantes de pago de planillas PILA
 * después de un pago exitoso.
 *
 * Soporta ambos operadores: SOI y Mi Planilla
 *
 * Este módulo se usa automáticamente después de que el admin confirma
 * un pago exitoso en el flujo admin-controlled.
 *
 * @author Claude Code
 * @date 2026-03-05
 */

import { Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { SOI_SELECTORS } from '../soi/selectors';

// ============================================================================
// TYPES
// ============================================================================

export interface ComprobanteResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  operador: 'SOI' | 'MI_PLANILLA';
  numeroPlanilla?: string;
  periodo?: string;
  error?: string;
}

export interface DownloadComprobanteOptions {
  operador: 'SOI' | 'MI_PLANILLA';
  numeroPlanilla?: string;
  periodo?: string; // "02/2026" o "2026-02"
  downloadPath?: string;
  waitTimeout?: number;
}

// ============================================================================
// DOWNLOAD FUNCTIONS
// ============================================================================

/**
 * Descarga el comprobante de pago de una planilla
 * Esta función se llama automáticamente después de un pago exitoso
 */
export async function descargarComprobante(
  page: Page,
  options: DownloadComprobanteOptions
): Promise<ComprobanteResult> {
  logger.info('Starting comprobante download', {
    operador: options.operador,
    numeroPlanilla: options.numeroPlanilla,
    periodo: options.periodo,
  });

  const downloadPath = options.downloadPath || path.resolve('./downloads/comprobantes');
  const waitTimeout = options.waitTimeout || 30000;

  // Asegurar que existe el directorio de descargas
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  try {
    // Configurar comportamiento de descarga
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
    });

    if (options.operador === 'SOI') {
      return await descargarComprobanteSOI(page, options, downloadPath, waitTimeout);
    } else {
      return await descargarComprobanteMiPlanilla(page, options, downloadPath, waitTimeout);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error downloading comprobante', {
      operador: options.operador,
      error: errorMsg,
    });

    return {
      success: false,
      operador: options.operador,
      numeroPlanilla: options.numeroPlanilla,
      error: errorMsg,
    };
  }
}

/**
 * Descarga comprobante de SOI
 */
async function descargarComprobanteSOI(
  page: Page,
  options: DownloadComprobanteOptions,
  downloadPath: string,
  waitTimeout: number
): Promise<ComprobanteResult> {
  logger.info('Downloading SOI comprobante');

  // Navegar a soportes de pago si no estamos ahí
  const currentUrl = page.url();
  if (!currentUrl.includes('soporte') && !currentUrl.includes('comprobante')) {
    await page.goto(SOI_SELECTORS.URLS.SOPORTES_PAGO, {
      waitUntil: 'networkidle0',
      timeout: waitTimeout,
    });
    await page.waitForTimeout(2000);
  }

  // Si tenemos número de planilla, buscarla específicamente
  if (options.numeroPlanilla) {
    // Buscar en la página el link de descarga para esta planilla
    await page.evaluate((numPlanilla) => {
      const rows = document.querySelectorAll('table tbody tr, tr');
      for (const row of rows) {
        if (row.textContent?.includes(numPlanilla)) {
          // Buscar link/botón de descarga en esta fila
          const downloadLinks = row.querySelectorAll('a[href*="pdf"], a[href*="comprobante"], a[href*="soporte"], img[src*="pdf"]');
          if (downloadLinks.length > 0) {
            (downloadLinks[0] as HTMLElement).click();
            return;
          }
        }
      }
    }, options.numeroPlanilla);
  } else {
    // Buscar el primer link de descarga disponible
    await page.evaluate(() => {
      const downloadSelectors = [
        'a[href*="comprobante"]',
        'a[href*="soporte"]',
        'a[href*="pdf"]',
        'img[src*="pdf"]',
        'button:has-text("Descargar")',
        'a:has-text("Descargar")',
      ];

      for (const selector of downloadSelectors) {
        try {
          const el = document.querySelector(selector);
          if (el) {
            (el as HTMLElement).click();
            return;
          }
        } catch { continue; }
      }
    });
  }

  // Esperar a que se descargue el archivo
  await page.waitForTimeout(5000);

  // Buscar el archivo descargado
  const result = findDownloadedFile(downloadPath, options);

  if (result.filePath) {
    logger.info('SOI comprobante downloaded successfully', {
      filePath: result.filePath,
      fileName: result.fileName,
    });
  }

  return result;
}

/**
 * Descarga comprobante de Mi Planilla
 */
async function descargarComprobanteMiPlanilla(
  page: Page,
  options: DownloadComprobanteOptions,
  downloadPath: string,
  waitTimeout: number
): Promise<ComprobanteResult> {
  logger.info('Downloading Mi Planilla comprobante');

  // Navegar a administrar planillas si no estamos ahí
  const currentUrl = page.url();
  if (!currentUrl.includes('Administrar') && !currentUrl.includes('Historial')) {
    await page.goto('https://independientes2.miplanilla.com/PrivadoIndependientes/Planilla/AdministrarPlanillas', {
      waitUntil: 'domcontentloaded',
      timeout: waitTimeout,
    });
    await page.waitForTimeout(3000);
  }

  // Buscar planilla pagada y descargar comprobante
  await page.evaluate((numPlanilla) => {
    // Buscar la planilla específica o la más reciente pagada
    const elements = document.querySelectorAll('a, button, div[class*="planilla"], tr');

    for (const el of elements) {
      const text = el.textContent?.toLowerCase() || '';

      // Si buscamos una planilla específica
      if (numPlanilla && !text.includes(numPlanilla.toLowerCase())) {
        continue;
      }

      // Verificar que es una planilla pagada
      if (text.includes('pagada') || text.includes('comprobante') || text.includes('soporte')) {
        // Buscar link de descarga
        const downloadLink = el.querySelector('a[href*="pdf"], a[href*="download"]') ||
                            el.querySelector('button:has-text("Descargar")');
        if (downloadLink) {
          (downloadLink as HTMLElement).click();
          return;
        }
      }
    }

    // Fallback: buscar cualquier botón de descarga
    const downloadBtns = document.querySelectorAll('a[href*="pdf"], button:has-text("Descargar"), a:has-text("Descargar comprobante")');
    if (downloadBtns.length > 0) {
      (downloadBtns[0] as HTMLElement).click();
    }
  }, options.numeroPlanilla);

  // Esperar a que se descargue el archivo
  await page.waitForTimeout(5000);

  // Buscar el archivo descargado
  const result = findDownloadedFile(downloadPath, options);

  if (result.filePath) {
    logger.info('Mi Planilla comprobante downloaded successfully', {
      filePath: result.filePath,
      fileName: result.fileName,
    });
  }

  return result;
}

/**
 * Busca el archivo descargado más reciente
 */
function findDownloadedFile(
  downloadPath: string,
  options: DownloadComprobanteOptions
): ComprobanteResult {
  try {
    const files = fs.readdirSync(downloadPath);

    // Filtrar solo PDFs y ordenar por fecha de modificación (más reciente primero)
    const pdfFiles = files
      .filter(f => f.endsWith('.pdf'))
      .map(f => ({
        name: f,
        path: path.join(downloadPath, f),
        stat: fs.statSync(path.join(downloadPath, f)),
      }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    if (pdfFiles.length > 0) {
      const mostRecent = pdfFiles[0];

      // Verificar que el archivo fue modificado en los últimos 30 segundos
      const isRecent = (Date.now() - mostRecent.stat.mtimeMs) < 30000;

      if (isRecent) {
        return {
          success: true,
          filePath: mostRecent.path,
          fileName: mostRecent.name,
          fileSize: mostRecent.stat.size,
          operador: options.operador,
          numeroPlanilla: options.numeroPlanilla,
          periodo: options.periodo,
        };
      }
    }

    return {
      success: false,
      operador: options.operador,
      numeroPlanilla: options.numeroPlanilla,
      error: 'No se encontró archivo de comprobante descargado',
    };
  } catch (error) {
    return {
      success: false,
      operador: options.operador,
      numeroPlanilla: options.numeroPlanilla,
      error: `Error buscando archivo: ${error}`,
    };
  }
}

// ============================================================================
// POST-PAYMENT HOOK
// ============================================================================

/**
 * Hook que se ejecuta automáticamente después de confirmar un pago exitoso
 * Este método es llamado por el endpoint POST /api/admin/pago/:sessionId/confirmar-exitoso
 */
export async function onPaymentSuccess(
  page: Page,
  operador: 'SOI' | 'MI_PLANILLA',
  numeroPlanilla: string,
  options?: {
    downloadPath?: string;
    notifyUrl?: string; // URL para notificar cuando esté listo
  }
): Promise<ComprobanteResult> {
  logger.info('Post-payment hook: Downloading comprobante automatically', {
    operador,
    numeroPlanilla,
  });

  // Descargar comprobante
  const result = await descargarComprobante(page, {
    operador,
    numeroPlanilla,
    downloadPath: options?.downloadPath,
  });

  if (result.success) {
    logger.info('Auto-comprobante download successful', {
      filePath: result.filePath,
      numeroPlanilla,
    });

    // TODO: Si hay notifyUrl, enviar notificación
    // if (options?.notifyUrl) {
    //   await fetch(options.notifyUrl, {
    //     method: 'POST',
    //     body: JSON.stringify({ comprobante: result }),
    //   });
    // }
  } else {
    logger.warn('Auto-comprobante download failed', {
      error: result.error,
      numeroPlanilla,
    });
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  descargarComprobante,
  onPaymentSuccess,
};
