/**
 * Comprobante Bot for Enlace Operativo
 * Handles downloading PILA payment receipts/vouchers
 */

import { Page } from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import { BotResponse, EnlaceComprobanteResult } from '../../types';
import { SELECTORS, URL_PATTERNS } from '../utils/selectors';
import {
  waitAndClick,
  waitAndType,
  sleep,
  elementExists,
  randomDelay,
  scrollToElement,
} from '../utils/wait';
import { browserManager } from '../utils/browser';
import { BotError } from '../../utils/errors';
import { enlaceAuth } from './auth.bot';

/**
 * Comprobante Bot Class
 * Manages PILA receipt download flow in Enlace Operativo
 */
export class EnlaceComprobanteBot {
  private readonly DOWNLOADS_PATH = './uploads/comprobantes';
  private readonly DOWNLOAD_TIMEOUT_MS = 60000; // 1 minute

  /**
   * Download comprobante (receipt) for a planilla
   * @param numeroPlanilla - PILA payment slip number
   * @param numeroDocumento - User document number (optional, for search)
   * @param periodo - Payment period YYYY-MM (optional, for search)
   * @returns Download result with file path
   */
  async descargarComprobante(
    numeroPlanilla: string,
    numeroDocumento?: string,
    periodo?: string
  ): Promise<BotResponse<EnlaceComprobanteResult>> {
    const startTime = Date.now();

    logger.info('Starting comprobante download', {
      numeroPlanilla,
      numeroDocumento,
      periodo,
    });

    // Get authenticated page
    const page = await enlaceAuth.ensureAuthenticated();

    try {
      // Ensure downloads directory exists
      await this.ensureDownloadsDirectory();

      // 1. Navigate to Comprobantes section
      logger.info('Navigating to Comprobantes section');
      await this.navigateToComprobantes(page);

      // 2. Search for planilla
      logger.info('Searching for planilla', { numeroPlanilla });
      await this.searchPlanilla(page, numeroPlanilla, numeroDocumento, periodo);

      // 3. Download comprobante
      logger.info('Downloading comprobante');
      const fileName = await this.downloadFile(page, numeroPlanilla, periodo);

      // 4. Verify download
      logger.info('Verifying download');
      const filePath = path.join(this.DOWNLOADS_PATH, fileName);
      const fileSize = await this.verifyDownload(filePath);

      logger.info('✅ Comprobante downloaded successfully', {
        fileName,
        fileSize,
      });

      return {
        success: true,
        data: {
          downloaded: true,
          fileName,
          filePath,
          fileSize,
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('❌ Comprobante download failed', {
        error,
        numeroPlanilla,
      });

      const screenshot = await browserManager.takeScreenshot(page, 'comprobante-error');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown download error',
        screenshot,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Ensure downloads directory exists
   */
  private async ensureDownloadsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.DOWNLOADS_PATH, { recursive: true });
      logger.debug('Downloads directory ready', { path: this.DOWNLOADS_PATH });
    } catch (error) {
      logger.error('Failed to create downloads directory', { error });
      throw new BotError('Failed to create downloads directory');
    }
  }

  /**
   * Navigate to Comprobantes section
   */
  private async navigateToComprobantes(page: Page): Promise<void> {
    try {
      // Try clicking menu item first
      const menuItemExists = await elementExists(page, SELECTORS.COMPROBANTE.MENU_ITEM);

      if (menuItemExists) {
        await waitAndClick(page, SELECTORS.COMPROBANTE.MENU_ITEM);
        await sleep(1000);
      } else {
        // Navigate directly to URL
        logger.debug('Menu item not found, navigating to URL');
        await page.goto(URL_PATTERNS.COMPROBANTES, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
      }

      await randomDelay(1000, 2000);
      await browserManager.takeScreenshot(page, 'comprobantes-section');
    } catch (error) {
      throw new BotError('Failed to navigate to Comprobantes section');
    }
  }

  /**
   * Search for planilla by number, document, or period
   */
  private async searchPlanilla(
    page: Page,
    numeroPlanilla: string,
    numeroDocumento?: string,
    periodo?: string
  ): Promise<void> {
    try {
      await browserManager.takeScreenshot(page, 'before-planilla-search');

      // Fill planilla number input
      const planillaInputExists = await elementExists(page, SELECTORS.COMPROBANTE.BUSCAR_PLANILLA);
      if (planillaInputExists) {
        logger.debug('Entering planilla number', { numeroPlanilla });
        await waitAndType(page, SELECTORS.COMPROBANTE.BUSCAR_PLANILLA, numeroPlanilla, {
          clear: true,
          delay: 100,
        });
        await randomDelay(300, 500);
      }

      // Fill document number if provided
      if (numeroDocumento) {
        const docInputExists = await elementExists(page, SELECTORS.APORTANTES.BUSCAR_INPUT);
        if (docInputExists) {
          logger.debug('Entering document number', { numeroDocumento });
          await waitAndType(page, SELECTORS.APORTANTES.BUSCAR_INPUT, numeroDocumento, {
            clear: true,
            delay: 100,
          });
          await randomDelay(300, 500);
        }
      }

      // Fill period if provided
      if (periodo) {
        const periodoInputExists = await elementExists(page, SELECTORS.COMPROBANTE.BUSCAR_PERIODO);
        if (periodoInputExists) {
          logger.debug('Entering periodo', { periodo });
          await waitAndType(page, SELECTORS.COMPROBANTE.BUSCAR_PERIODO, periodo, {
            clear: true,
            delay: 100,
          });
          await randomDelay(300, 500);
        }
      }

      // Click search button
      const searchButtonExists = await elementExists(page, SELECTORS.COMPROBANTE.BUSCAR_BUTTON);
      if (searchButtonExists) {
        logger.debug('Clicking search button');
        await waitAndClick(page, SELECTORS.COMPROBANTE.BUSCAR_BUTTON);
      } else {
        // Try pressing Enter
        await page.keyboard.press('Enter');
      }

      await sleep(2000);
      await browserManager.takeScreenshot(page, 'planilla-search-results');

      // Verify results exist
      const noResultsExists = await elementExists(page, SELECTORS.APORTANTES.RESULTS.NO_RESULTS);
      if (noResultsExists) {
        throw new BotError('Planilla not found in search results');
      }

      logger.debug('Planilla found in search results');
    } catch (error) {
      if (error instanceof BotError) {
        throw error;
      }
      throw new BotError('Failed to search for planilla');
    }
  }

  /**
   * Download the comprobante file
   */
  private async downloadFile(
    page: Page,
    numeroPlanilla: string,
    periodo?: string
  ): Promise<string> {
    try {
      await browserManager.takeScreenshot(page, 'before-download-click');

      // Try multiple download button selectors
      const downloadSelectors = [
        SELECTORS.COMPROBANTE.DESCARGAR_PDF,
        SELECTORS.COMPROBANTE.DESCARGAR_BUTTON,
        SELECTORS.COMPROBANTE.VER_COMPROBANTE,
      ];

      let buttonClicked = false;

      for (const selector of downloadSelectors) {
        const buttonExists = await elementExists(page, selector);
        if (buttonExists) {
          logger.debug('Clicking download button', { selector });
          await scrollToElement(page, selector);
          await randomDelay(500, 1000);

          // Set up download tracking before clicking
          const downloadPromise = this.waitForDownload(page);

          await waitAndClick(page, selector);
          buttonClicked = true;

          // Wait for download to complete
          logger.info('Waiting for download to complete...');
          const fileName = await downloadPromise;

          logger.debug('Download completed', { fileName });
          return fileName;
        }
      }

      if (!buttonClicked) {
        throw new BotError('Download button not found');
      }

      // Fallback: generate filename if download tracking failed
      const timestamp = Date.now();
      const fileName = `comprobante-${numeroPlanilla}-${periodo || timestamp}.pdf`;
      logger.warn('Download tracking failed, using fallback filename', { fileName });
      return fileName;
    } catch (error) {
      if (error instanceof BotError) {
        throw error;
      }
      throw new BotError('Failed to download comprobante file');
    }
  }

  /**
   * Wait for file download to complete
   */
  private async waitForDownload(_page: Page): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new BotError('Download timeout after 1 minute'));
      }, this.DOWNLOAD_TIMEOUT_MS);

      // Monitor downloads directory for new files
      const checkInterval = setInterval(async () => {
        try {
          const files = await fs.readdir(this.DOWNLOADS_PATH);

          // Look for recently created PDF files
          for (const file of files) {
            if (file.endsWith('.pdf') && !file.includes('.crdownload')) {
              const filePath = path.join(this.DOWNLOADS_PATH, file);
              const stats = await fs.stat(filePath);

              // Check if file was created in last 5 seconds
              const age = Date.now() - stats.mtimeMs;
              if (age < 5000) {
                clearTimeout(timeout);
                clearInterval(checkInterval);
                resolve(file);
                return;
              }
            }
          }
        } catch (error) {
          logger.warn('Error checking downloads directory', { error });
        }
      }, 1000); // Check every second
    });
  }

  /**
   * Verify download was successful
   */
  private async verifyDownload(filePath: string): Promise<number> {
    try {
      // Wait a bit for file to be fully written
      await sleep(1000);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        throw new BotError('Downloaded file not found');
      }

      // Get file size
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      // Verify file is not empty
      if (fileSize === 0) {
        throw new BotError('Downloaded file is empty');
      }

      // Verify file is a valid PDF (basic check)
      const fileBuffer = await fs.readFile(filePath);
      const isPDF = fileBuffer.toString('ascii', 0, 4) === '%PDF';

      if (!isPDF) {
        logger.warn('Downloaded file may not be a valid PDF');
      }

      logger.debug('Download verified successfully', { filePath, fileSize });
      return fileSize;
    } catch (error) {
      if (error instanceof BotError) {
        throw error;
      }
      throw new BotError('Failed to verify download');
    }
  }

  /**
   * Delete old comprobantes (cleanup)
   * @param daysOld - Delete files older than this many days
   */
  async cleanupOldFiles(daysOld: number = 30): Promise<number> {
    try {
      const files = await fs.readdir(this.DOWNLOADS_PATH);
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.DOWNLOADS_PATH, file);
        const stats = await fs.stat(filePath);

        if (stats.mtimeMs < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
          logger.debug('Deleted old comprobante', { file });
        }
      }

      logger.info('Cleanup completed', { deletedCount, daysOld });
      return deletedCount;
    } catch (error) {
      logger.error('Error during cleanup', { error });
      return 0;
    }
  }
}

// ============================================================================
// FASE 4.1 - PARTE 2: VERIFICACIÓN DE ESTADO DE PLANILLA
// ============================================================================

/**
 * Estado de una planilla PILA
 */
export interface PlanillaStatus {
  numeroPlanilla: string;
  estado: 'PAGADA' | 'PENDIENTE' | 'RECHAZADA' | 'VENCIDA';
  fechaPago?: Date;
  valor?: number;
  comprobantePdfUrl?: string;
}

/**
 * Datos extraídos de la tabla (raw)
 */
interface PlanillaTableData {
  estado: string;
  fechaPago: string | null;
  valor: string | null;
  pdfUrl: string | null;
}

/**
 * Verifica el estado de una planilla PILA en Enlace Operativo
 *
 * @param numeroPlanilla - Número de planilla a buscar
 * @returns Estado de la planilla (PAGADA, PENDIENTE, RECHAZADA, VENCIDA)
 *
 * @example
 * const status = await verificarEstadoPlanilla('123456789');
 * if (status.estado === 'PAGADA') {
 *   console.log('Planilla pagada, descargar comprobante');
 * }
 */
export async function verificarEstadoPlanilla(
  numeroPlanilla: string
): Promise<PlanillaStatus> {
  logger.info('Checking planilla status', { numeroPlanilla });

  // Obtener página autenticada
  const page = await enlaceAuth.ensureAuthenticated();

  try {
    // 1. Navegar a comprobantes
    logger.info('Step 1/4: Navigating to comprobantes');
    await navegarAComprobantes(page);
    await browserManager.takeScreenshot(page, 'comprobante-status-page');

    // 2. Buscar por número de planilla
    logger.info('Step 2/4: Searching for planilla', { numeroPlanilla });
    await buscarPlanillaStatus(page, numeroPlanilla);
    await browserManager.takeScreenshot(page, 'comprobante-status-search');

    // 3. Verificar si hay resultados
    const hasResults = await verificarResultados(page);

    if (!hasResults) {
      logger.info('Planilla not found in comprobantes (still PENDIENTE)', {
        numeroPlanilla,
      });
      return {
        numeroPlanilla,
        estado: 'PENDIENTE',
      };
    }

    // 4. Extraer datos de la tabla
    logger.info('Step 3/4: Extracting planilla data from table');
    const planillaData = await extraerDatosPlanilla(page, numeroPlanilla);

    if (!planillaData) {
      logger.warn('Planilla found but could not extract data', {
        numeroPlanilla,
      });
      return {
        numeroPlanilla,
        estado: 'PENDIENTE',
      };
    }

    // 5. Parsear y retornar estado completo
    logger.info('Step 4/4: Parsing planilla data');
    const planillaStatus = parsePlanillaData(numeroPlanilla, planillaData);

    logger.info('Planilla status retrieved successfully', {
      numeroPlanilla,
      estado: planillaStatus.estado,
      fechaPago: planillaStatus.fechaPago,
      valor: planillaStatus.valor,
      hasPdf: !!planillaStatus.comprobantePdfUrl,
    });

    return planillaStatus;
  } catch (error) {
    await browserManager.takeScreenshot(page, 'comprobante-status-error');
    logger.error('Error checking planilla status', { numeroPlanilla, error });
    throw new BotError(
      `Failed to check planilla status: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Navega a la página de comprobantes (helper para verificarEstadoPlanilla)
 */
async function navegarAComprobantes(page: Page): Promise<void> {
  try {
    // Estrategia 1: URL directa
    await page.goto(URL_PATTERNS.COMPROBANTES, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await sleep(2000);
    logger.info('Navigated to comprobantes page');
  } catch (error) {
    // Estrategia 2: Click en menú
    logger.warn('Direct navigation failed, trying menu click');

    try {
      const menuExists = await elementExists(page, SELECTORS.COMPROBANTES.MENU_COMPROBANTES);
      if (menuExists) {
        await waitAndClick(page, SELECTORS.COMPROBANTES.MENU_COMPROBANTES);
        await sleep(3000);
        logger.info('Navigated via menu click');
      } else {
        // Estrategia 3: URL alternativa
        logger.warn('Menu click failed, trying alternative URL');
        await page.goto(URL_PATTERNS.COMPROBANTES_ALT!, {
          waitUntil: 'networkidle0',
        });
        await sleep(2000);
      }
    } catch (menuError) {
      logger.error('All navigation strategies failed', { menuError });
      throw menuError;
    }
  }
}

/**
 * Busca una planilla por número (helper para verificarEstadoPlanilla)
 */
async function buscarPlanillaStatus(
  page: Page,
  numeroPlanilla: string
): Promise<void> {
  try {
    // Estrategia 1: Input de búsqueda general
    const searchInputExists = await elementExists(page, SELECTORS.COMPROBANTES.BUSCAR_INPUT);

    if (searchInputExists) {
      logger.info('Using general search input');
      await waitAndType(page, SELECTORS.COMPROBANTES.BUSCAR_INPUT, numeroPlanilla, {
        clear: true,
        delay: 100,
      });

      // Click en buscar si hay botón
      const searchButtonExists = await elementExists(
        page,
        SELECTORS.COMPROBANTES.BUSCAR_BUTTON
      );
      if (searchButtonExists) {
        await waitAndClick(page, SELECTORS.COMPROBANTES.BUSCAR_BUTTON);
      } else {
        // Presionar Enter si no hay botón
        await page.keyboard.press('Enter');
      }

      await sleep(3000);
      return;
    }

    // Estrategia 2: Input específico de planilla
    const planillaInputExists = await elementExists(
      page,
      SELECTORS.COMPROBANTES.BUSCAR_PLANILLA
    );

    if (planillaInputExists) {
      logger.info('Using planilla-specific search input');
      await waitAndType(page, SELECTORS.COMPROBANTES.BUSCAR_PLANILLA, numeroPlanilla, {
        clear: true,
      });

      await waitAndClick(page, SELECTORS.COMPROBANTES.BUSCAR_BUTTON);
      await sleep(3000);
      return;
    }

    // Estrategia 3: Tabla ya cargada, buscar directamente
    logger.info('No search input found, assuming table is already loaded');
    await sleep(1000);
  } catch (error) {
    logger.warn('Error during search, continuing anyway', { error });
  }
}

/**
 * Verifica si hay resultados en la tabla
 */
async function verificarResultados(page: Page): Promise<boolean> {
  // Verificar mensaje "No se encontraron resultados"
  const noResults = await elementExists(page, SELECTORS.COMPROBANTES.RESULTS.NO_RESULTS);
  if (noResults) {
    return false;
  }

  const noResultsAlt = await elementExists(
    page,
    SELECTORS.COMPROBANTES.RESULTS.NO_RESULTS_ALT
  );
  if (noResultsAlt) {
    return false;
  }

  // Verificar que exista tabla
  const tableExists =
    (await elementExists(page, SELECTORS.COMPROBANTES.RESULTS.TABLE)) ||
    (await elementExists(page, SELECTORS.COMPROBANTES.RESULTS.TABLE_ALT));

  if (!tableExists) {
    return false;
  }

  // Verificar que la tabla tenga filas
  const rows = await page.$$(SELECTORS.COMPROBANTES.RESULTS.ROW_ALT);
  return rows.length > 0;
}

/**
 * Extrae datos de la planilla de la tabla de resultados
 * Usa múltiples estrategias para manejar diferentes formatos de tabla
 */
async function extraerDatosPlanilla(
  page: Page,
  numeroPlanilla: string
): Promise<PlanillaTableData | null> {
  try {
    // Estrategia 1: Data attributes (más estable)
    const dataByAttributes = await extraerPorDataAttributes(page, numeroPlanilla);
    if (dataByAttributes) {
      logger.info('Extracted data using data attributes');
      return dataByAttributes;
    }

    // Estrategia 2: Posiciones de columnas (fallback)
    const dataByPosition = await extraerPorPosicion(page, numeroPlanilla);
    if (dataByPosition) {
      logger.info('Extracted data using column positions');
      return dataByPosition;
    }

    // Estrategia 3: Búsqueda de texto (último recurso)
    const dataByText = await extraerPorTexto(page, numeroPlanilla);
    if (dataByText) {
      logger.info('Extracted data using text search');
      return dataByText;
    }

    logger.warn('Could not extract planilla data with any strategy');
    return null;
  } catch (error) {
    logger.error('Error extracting planilla data', { error });
    return null;
  }
}

/**
 * Estrategia 1: Extracción por data attributes
 */
async function extraerPorDataAttributes(
  page: Page,
  numeroPlanilla: string
): Promise<PlanillaTableData | null> {
  return await page.evaluate((numPlanilla) => {
    const table = document.querySelector('table');
    if (!table) return null;

    const rows = table.querySelectorAll('tbody tr');

    for (const row of rows) {
      // Buscar celda con número de planilla
      const numeroPlanillaCell =
        row.querySelector('[data-field="numeroPlanilla"]') ||
        row.querySelector('[data-planilla-numero]');

      if (numeroPlanillaCell?.textContent?.includes(numPlanilla)) {
        // Extraer datos usando data attributes
        const estadoCell = row.querySelector('[data-field="estado"]');
        const fechaPagoCell = row.querySelector('[data-field="fechaPago"]');
        const valorCell = row.querySelector('[data-field="valor"]');
        const pdfLink = row.querySelector('a[href*=".pdf"]');
        const downloadButton = row.querySelector('button:has-text("Descargar")');

        return {
          estado: estadoCell?.textContent?.trim() || '',
          fechaPago: fechaPagoCell?.textContent?.trim() || null,
          valor: valorCell?.textContent?.trim() || null,
          pdfUrl:
            pdfLink?.getAttribute('href') ||
            downloadButton?.getAttribute('data-url') ||
            null,
        };
      }
    }

    return null;
  }, numeroPlanilla);
}

/**
 * Estrategia 2: Extracción por posición de columnas
 * Asume: Col 1 = Número, Col 2 = Fecha, Col 3 = Valor, Col 4 = Estado
 */
async function extraerPorPosicion(
  page: Page,
  numeroPlanilla: string
): Promise<PlanillaTableData | null> {
  return await page.evaluate((numPlanilla) => {
    const table = document.querySelector('table');
    if (!table) return null;

    const rows = table.querySelectorAll('tbody tr');

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) continue;

      // Buscar por número de planilla en cualquier celda
      const numeroPlanillaCell = Array.from(cells).find((cell) =>
        cell.textContent?.includes(numPlanilla)
      );

      if (numeroPlanillaCell) {
        // Intentar extraer por posición
        // Formato común: Número | Fecha | Valor | Estado | Acciones
        const estado =
          cells[3]?.textContent?.trim() || cells[4]?.textContent?.trim() || '';
        const fechaPago = cells[1]?.textContent?.trim() || null;
        const valor = cells[2]?.textContent?.trim() || null;

        // Buscar PDF link en la fila
        const pdfLink = row.querySelector('a[href*=".pdf"]');

        return {
          estado,
          fechaPago,
          valor,
          pdfUrl: pdfLink?.getAttribute('href') || null,
        };
      }
    }

    return null;
  }, numeroPlanilla);
}

/**
 * Estrategia 3: Extracción por búsqueda de texto
 * Busca patrones de texto para identificar columnas
 */
async function extraerPorTexto(
  page: Page,
  numeroPlanilla: string
): Promise<PlanillaTableData | null> {
  return await page.evaluate((numPlanilla) => {
    const table = document.querySelector('table');
    if (!table) return null;

    const rows = table.querySelectorAll('tbody tr');

    for (const row of rows) {
      const cells = row.querySelectorAll('td');

      // Buscar celda con número de planilla
      const numeroPlanillaCell = Array.from(cells).find((cell) =>
        cell.textContent?.includes(numPlanilla)
      );

      if (numeroPlanillaCell) {
        // Buscar estado por palabras clave
        let estado = '';
        const estadoCandidates = Array.from(cells).filter(
          (cell) =>
            cell.textContent?.toLowerCase().includes('pagada') ||
            cell.textContent?.toLowerCase().includes('pendiente') ||
            cell.textContent?.toLowerCase().includes('rechazada') ||
            cell.textContent?.toLowerCase().includes('vencida') ||
            cell.textContent?.toLowerCase().includes('aprobada')
        );

        if (estadoCandidates.length > 0) {
          estado = estadoCandidates[0].textContent?.trim() || '';
        }

        // Buscar fecha (formato DD/MM/YYYY)
        let fechaPago: string | null = null;
        const fechaCandidates = Array.from(cells).filter((cell) =>
          /\d{1,2}\/\d{1,2}\/\d{4}/.test(cell.textContent || '')
        );

        if (fechaCandidates.length > 0) {
          fechaPago = fechaCandidates[0].textContent?.trim() || null;
        }

        // Buscar valor (formato con $ o números grandes)
        let valor: string | null = null;
        const valorCandidates = Array.from(cells).filter(
          (cell) =>
            cell.textContent?.includes('$') || /\d{3,}/.test(cell.textContent || '')
        );

        if (valorCandidates.length > 0) {
          valor = valorCandidates[0].textContent?.trim() || null;
        }

        // Buscar PDF link
        const pdfLink = row.querySelector('a[href*=".pdf"]');

        return {
          estado,
          fechaPago,
          valor,
          pdfUrl: pdfLink?.getAttribute('href') || null,
        };
      }
    }

    return null;
  }, numeroPlanilla);
}

/**
 * Parsea los datos raw de la tabla y retorna un PlanillaStatus estructurado
 */
function parsePlanillaData(
  numeroPlanilla: string,
  rawData: PlanillaTableData
): PlanillaStatus {
  // 1. Parsear estado
  const estado = parseEstado(rawData.estado);

  // 2. Parsear fecha de pago
  const fechaPago = parseFechaPago(rawData.fechaPago);

  // 3. Parsear valor
  const valor = parseValor(rawData.valor);

  // 4. Construir resultado
  return {
    numeroPlanilla,
    estado,
    fechaPago,
    valor,
    comprobantePdfUrl: rawData.pdfUrl || undefined,
  };
}

/**
 * Parsea el estado de la planilla
 */
function parseEstado(estadoText: string): PlanillaStatus['estado'] {
  const estadoLower = estadoText.toLowerCase();

  if (estadoLower.includes('pagada') || estadoLower.includes('aprobada')) {
    return 'PAGADA';
  }

  if (estadoLower.includes('rechazada') || estadoLower.includes('fallida')) {
    return 'RECHAZADA';
  }

  if (estadoLower.includes('vencida') || estadoLower.includes('expirada')) {
    return 'VENCIDA';
  }

  // Default: PENDIENTE
  return 'PENDIENTE';
}

/**
 * Parsea la fecha de pago
 * Soporta formatos: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
 */
function parseFechaPago(fechaText: string | null): Date | undefined {
  if (!fechaText) return undefined;

  // Formato DD/MM/YYYY (colombiano)
  const matchDDMMYYYY = fechaText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchDDMMYYYY) {
    const [_, dia, mes, anio] = matchDDMMYYYY;
    return new Date(parseInt(anio), parseInt(mes) - 1, parseInt(dia));
  }

  // Formato YYYY-MM-DD (ISO)
  const matchYYYYMMDD = fechaText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (matchYYYYMMDD) {
    const [_, anio, mes, dia] = matchYYYYMMDD;
    return new Date(parseInt(anio), parseInt(mes) - 1, parseInt(dia));
  }

  // Formato DD-MM-YYYY (alternativo)
  const matchDDMMYYYY2 = fechaText.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (matchDDMMYYYY2) {
    const [_, dia, mes, anio] = matchDDMMYYYY2;
    return new Date(parseInt(anio), parseInt(mes) - 1, parseInt(dia));
  }

  logger.warn('Could not parse fecha pago', { fechaText });
  return undefined;
}

/**
 * Parsea el valor de la planilla
 * Extrae solo números y convierte a entero
 */
function parseValor(valorText: string | null): number | undefined {
  if (!valorText) return undefined;

  // Extraer solo dígitos
  const valorNumerico = valorText.replace(/\D/g, '');

  if (valorNumerico.length === 0) {
    logger.warn('Could not parse valor', { valorText });
    return undefined;
  }

  return parseInt(valorNumerico, 10);
}

// ============================================================================
// FASE 4.2 - DESCARGA DE COMPROBANTE PDF
// ============================================================================

/**
 * Resultado de descarga de comprobante
 */
export interface DownloadResult {
  success: boolean;
  localPath?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

/**
 * Descarga el comprobante PDF de una planilla pagada
 *
 * @param numeroPlanilla - Número de planilla a descargar
 * @param outputDir - Directorio donde guardar el PDF (default: ./downloads/comprobantes)
 * @returns Resultado de la descarga con path local y metadatos
 *
 * @example
 * const result = await descargarComprobante('123456789');
 * if (result.success) {
 *   console.log('PDF descargado:', result.localPath);
 *   console.log('Tamaño:', result.fileSize);
 * }
 */
export async function descargarComprobante(
  numeroPlanilla: string,
  outputDir: string = './downloads/comprobantes'
): Promise<DownloadResult> {
  logger.info('Downloading comprobante PDF', { numeroPlanilla, outputDir });

  try {
    // 1. Verificar estado de planilla
    logger.info('Step 1/7: Verifying planilla status');
    const status = await verificarEstadoPlanilla(numeroPlanilla);

    if (status.estado !== 'PAGADA') {
      logger.warn('Planilla is not paid yet', {
        numeroPlanilla,
        estado: status.estado,
      });
      return {
        success: false,
        error: `Planilla not paid yet: ${status.estado}`,
      };
    }

    logger.info('Planilla is paid, proceeding with download', {
      numeroPlanilla,
      fechaPago: status.fechaPago,
      valor: status.valor,
    });

    const page = await enlaceAuth.ensureAuthenticated();

    // 2. Asegurar que estamos en la página de comprobantes
    logger.info('Step 2/7: Ensuring we are on comprobantes page');
    const currentUrl = page.url();

    if (!currentUrl.includes('/comprobantes')) {
      logger.info('Not on comprobantes page, navigating');
      await page.goto(URL_PATTERNS.COMPROBANTES, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      await sleep(2000);

      // Re-buscar planilla
      logger.info('Re-searching for planilla after navigation');
      const searchInputExists = await elementExists(
        page,
        SELECTORS.COMPROBANTES.BUSCAR_INPUT
      );

      if (searchInputExists) {
        await waitAndType(page, SELECTORS.COMPROBANTES.BUSCAR_INPUT, numeroPlanilla, {
          clear: true,
        });
        await sleep(3000);
      }
    }

    await browserManager.takeScreenshot(page, 'comprobante-before-download');

    // 3. Crear directorio de descarga
    logger.info('Step 3/7: Creating download directory');
    await fs.mkdir(outputDir, { recursive: true });
    logger.info('Download directory ready', { outputDir });

    // 4. Configurar descarga usando CDP
    logger.info('Step 4/7: Configuring download behavior via CDP');
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: path.resolve(outputDir),
    });
    logger.info('CDP download behavior configured');

    // 5. Encontrar y hacer click en botón de descarga
    logger.info('Step 5/7: Finding and clicking download button');

    const downloadButton = await page.evaluate((numPlanilla) => {
      const table = document.querySelector('table');
      if (!table) return null;

      const rows = table.querySelectorAll('tbody tr');

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        const planillaCell = Array.from(cells).find((cell) =>
          cell.textContent?.includes(numPlanilla)
        );

        if (planillaCell) {
          // Estrategia 1: Buscar botón con texto "Descargar"
          const downloadBtnDescargar = row.querySelector('button');
          const buttons = row.querySelectorAll('button');

          for (const btn of buttons) {
            if (
              btn.textContent?.toLowerCase().includes('descargar') ||
              btn.textContent?.toLowerCase().includes('pdf')
            ) {
              (btn as HTMLElement).click();
              return 'button-descargar';
            }
          }

          // Estrategia 2: Buscar link PDF directo
          const pdfLink = row.querySelector('a[href*=".pdf"]');
          if (pdfLink) {
            (pdfLink as HTMLElement).click();
            return 'link-pdf';
          }

          // Estrategia 3: Buscar cualquier botón en la fila (último recurso)
          if (downloadBtnDescargar) {
            (downloadBtnDescargar as HTMLElement).click();
            return 'button-generic';
          }
        }
      }

      return null;
    }, numeroPlanilla);

    if (!downloadButton) {
      await browserManager.takeScreenshot(page, 'comprobante-download-button-not-found');
      throw new BotError('Could not find download button or PDF link');
    }

    logger.info('Download initiated', { method: downloadButton });
    await browserManager.takeScreenshot(page, 'comprobante-download-clicked');

    // 6. Esperar a que se descargue el archivo
    logger.info('Step 6/7: Waiting for download to complete');
    const fileName = await waitForDownload(outputDir, 30000);

    if (!fileName) {
      await browserManager.takeScreenshot(page, 'comprobante-download-timeout');
      throw new BotError('Download timeout - no file received after 30 seconds');
    }

    const localPath = path.join(outputDir, fileName);
    logger.info('File downloaded', { fileName, localPath });

    // 7. Verificar que el archivo existe y tiene contenido
    logger.info('Step 7/7: Verifying downloaded file');
    const stats = await fs.stat(localPath);

    if (stats.size < 1000) {
      // PDF muy pequeño, probablemente corrupto
      logger.error('Downloaded file is too small', { size: stats.size });
      throw new BotError(`Downloaded file too small: ${stats.size} bytes (expected > 1KB)`);
    }

    // Verificar que es un PDF válido
    const fileBuffer = await fs.readFile(localPath);
    const isPDF = fileBuffer.toString('ascii', 0, 4) === '%PDF';

    if (!isPDF) {
      logger.warn('Downloaded file may not be a valid PDF');
    }

    // 8. Renombrar archivo con nombre descriptivo
    const timestamp = new Date().getTime();
    const newFileName = `comprobante_${numeroPlanilla}_${timestamp}.pdf`;
    const newPath = path.join(outputDir, newFileName);

    await fs.rename(localPath, newPath);
    logger.info('File renamed to descriptive name', { newFileName });

    logger.info('✅ Comprobante downloaded successfully', {
      numeroPlanilla,
      localPath: newPath,
      fileName: newFileName,
      fileSize: stats.size,
    });

    return {
      success: true,
      localPath: newPath,
      fileName: newFileName,
      fileSize: stats.size,
    };
  } catch (error) {
    const page = await enlaceAuth.ensureAuthenticated();
    await browserManager.takeScreenshot(page, 'comprobante-download-error');
    logger.error('❌ Error downloading comprobante', { numeroPlanilla, error });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Espera a que un archivo se descargue en el directorio especificado
 *
 * @param downloadDir - Directorio donde se guardará el archivo
 * @param timeout - Tiempo máximo de espera en ms (default: 30000)
 * @returns Nombre del archivo descargado, o null si timeout
 *
 * @example
 * const fileName = await waitForDownload('./downloads', 30000);
 * if (fileName) {
 *   console.log('Archivo descargado:', fileName);
 * }
 */
async function waitForDownload(
  downloadDir: string,
  timeout: number = 30000
): Promise<string | null> {
  const startTime = Date.now();
  let lastFileCount = 0;

  logger.info('Waiting for file download', { downloadDir, timeout });

  while (Date.now() - startTime < timeout) {
    try {
      const files = await fs.readdir(downloadDir);

      // Buscar archivos PDF que no sean temporales
      const pdfFiles = files.filter(
        (file) =>
          file.endsWith('.pdf') &&
          !file.endsWith('.crdownload') && // Chrome temp
          !file.endsWith('.tmp') && // Generic temp
          !file.endsWith('.download') // Firefox temp
      );

      // Log progress si cambia el número de archivos
      if (pdfFiles.length !== lastFileCount) {
        logger.info('PDF files in download directory', { count: pdfFiles.length });
        lastFileCount = pdfFiles.length;
      }

      if (pdfFiles.length > 0) {
        // Obtener stats de todos los archivos PDF
        const fileStats = await Promise.all(
          pdfFiles.map(async (file) => {
            const filePath = path.join(downloadDir, file);
            const stats = await fs.stat(filePath);
            return {
              name: file,
              mtime: stats.mtime,
              mtimeMs: stats.mtimeMs,
              size: stats.size,
            };
          })
        );

        // Ordenar por fecha de modificación (más reciente primero)
        fileStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

        const newestFile = fileStats[0];

        // Verificar que el archivo fue creado/modificado recientemente (últimos 10 segundos)
        const age = Date.now() - newestFile.mtimeMs;

        if (age < 10000) {
          // Esperar un poco más para asegurar que terminó de escribirse
          await sleep(500);

          // Verificar que el archivo tiene contenido
          const finalStats = await fs.stat(path.join(downloadDir, newestFile.name));

          if (finalStats.size > 0) {
            logger.info('Download completed', {
              fileName: newestFile.name,
              fileSize: finalStats.size,
              ageMs: age,
            });
            return newestFile.name;
          }
        }
      }

      // Esperar 500ms antes de revisar de nuevo
      await sleep(500);
    } catch (error) {
      logger.warn('Error checking for downloaded file', { error });
    }
  }

  logger.error('Download timeout - no file received', {
    downloadDir,
    timeout,
    elapsedTime: Date.now() - startTime,
  });

  return null;
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton instance
 */
export const enlaceComprobante = new EnlaceComprobanteBot();

/**
 * Quick function for downloading comprobante
 */
export async function descargarComprobanteEnlace(
  numeroPlanilla: string,
  numeroDocumento?: string,
  periodo?: string
): Promise<BotResponse<EnlaceComprobanteResult>> {
  return enlaceComprobante.descargarComprobante(numeroPlanilla, numeroDocumento, periodo);
}
