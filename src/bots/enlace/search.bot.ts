/**
 * Search Bot for Enlace Operativo
 * Searches for existing users (aportantes) in the system
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger';
import { enlaceAuth } from './auth.bot';
import { waitAndType, sleep, elementExists, randomDelay } from '../utils/wait';
import { SELECTORS, URL_PATTERNS } from '../utils/selectors';
import { browserManager } from '../utils/browser';
import { config } from '../../utils/config';

/**
 * Search result interface
 */
export interface SearchResult {
  found: boolean;
  enlaceUserId?: string;
  nombre?: string;
  documento?: string;
  estado?: string;
}

/**
 * Search for a user in Enlace Operativo by document number
 * @param numeroDocumento - Document number to search for
 * @returns Search result with user data if found
 */
export async function buscarUsuario(numeroDocumento: string): Promise<SearchResult> {
  logger.info('Searching for user in Enlace', { numeroDocumento });

  // Get authenticated page
  const page = await enlaceAuth.ensureAuthenticated();

  try {
    // 1. Navigate to "Administrar aportantes"
    logger.info('Navigating to administrar aportantes');

    const enlaceBaseUrl = config.enlace?.baseUrl || URL_PATTERNS.BASE;
    const aportantesUrl = `${enlaceBaseUrl}/gestion/#/home/administrar-aportantes`;

    await page.goto(aportantesUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await sleep(2000); // Wait for complete load
    await browserManager.takeScreenshot(page, 'search-aportantes-page');

    // 2. Look for search input field
    logger.info('Looking for search input');

    const searchInputExists = await elementExists(page, SELECTORS.APORTANTES.BUSCAR_INPUT);
    if (!searchInputExists) {
      logger.error('Search input not found');
      await browserManager.takeScreenshot(page, 'search-input-not-found');
      throw new Error('Search input field not found on page');
    }

    await page.waitForSelector(SELECTORS.APORTANTES.BUSCAR_INPUT, { timeout: 10000 });

    // 3. Clear and type document number
    logger.info('Entering document number in search', { numeroDocumento });
    await waitAndType(
      page,
      SELECTORS.APORTANTES.BUSCAR_INPUT,
      numeroDocumento,
      { clear: true, delay: 100 }
    );

    await randomDelay(500, 1000);

    // 4. Press Enter to search
    logger.info('Pressing Enter to search');
    await page.keyboard.press('Enter');

    // 5. Wait for results to load
    logger.info('Waiting for search results');
    await sleep(3000); // Give time for search to complete

    await browserManager.takeScreenshot(page, 'search-results');

    // 6. Check for "no results" message
    const noResultsExists = await elementExists(page, SELECTORS.APORTANTES.RESULTS.NO_RESULTS);
    const noResultsAltExists = await elementExists(page, SELECTORS.APORTANTES.RESULTS.NO_RESULTS_ALT);

    if (noResultsExists || noResultsAltExists) {
      logger.info('User not found in Enlace (no results message)', { numeroDocumento });
      return { found: false };
    }

    // 7. Check if results table exists
    const tableExists = await elementExists(page, SELECTORS.APORTANTES.RESULTS.TABLE);

    if (!tableExists) {
      logger.warn('Results table not found, checking page text');

      // Fallback: check if there's any indication of results in page text
      const hasResultsText = await page.evaluate(() => {
        const pageText = document.body.innerText.toLowerCase();
        return pageText.includes('resultado') || pageText.includes('aportante');
      });

      if (hasResultsText) {
        logger.info('Results might exist but table structure is different');
        await browserManager.takeScreenshot(page, 'search-results-no-table');
        // Return found=true but without detailed data
        return { found: true };
      }

      logger.info('No results found', { numeroDocumento });
      return { found: false };
    }

    // 8. Extract user data from the first result row
    logger.info('Extracting user data from results table');

    const userData = await page.evaluate((docNum) => {
      // Find the table
      const table = document.querySelector('table');
      if (!table) return null;

      const tbody = table.querySelector('tbody');
      if (!tbody) return null;

      const rows = tbody.querySelectorAll('tr');

      // Search for row containing the document number
      for (const row of rows) {
        const cells = row.querySelectorAll('td');

        // Check if any cell contains the document number
        let foundDoc = false;
        for (const cell of cells) {
          if (cell.textContent?.includes(docNum)) {
            foundDoc = true;
            break;
          }
        }

        if (foundDoc && cells.length > 0) {
          // Extract data based on common table structures
          // Adjust column indices based on actual table structure
          return {
            enlaceUserId: row.getAttribute('data-user-id') ||
                         row.getAttribute('data-id') ||
                         undefined,
            documento: cells[0]?.textContent?.trim() ||
                      cells[1]?.textContent?.trim() ||
                      docNum,
            nombre: cells[1]?.textContent?.trim() ||
                   cells[0]?.textContent?.trim() ||
                   cells[2]?.textContent?.trim() ||
                   undefined,
            estado: cells[2]?.textContent?.trim() ||
                   cells[3]?.textContent?.trim() ||
                   'ACTIVO',
          };
        }
      }

      // If not found by document number, try first row as fallback
      const firstRow = rows[0];
      if (firstRow) {
        const cells = firstRow.querySelectorAll('td');
        if (cells.length > 0) {
          return {
            enlaceUserId: firstRow.getAttribute('data-user-id') ||
                         firstRow.getAttribute('data-id') ||
                         undefined,
            documento: cells[0]?.textContent?.trim() || docNum,
            nombre: cells[1]?.textContent?.trim() || cells[0]?.textContent?.trim(),
            estado: cells[2]?.textContent?.trim() || 'ACTIVO',
          };
        }
      }

      return null;
    }, numeroDocumento);

    if (userData) {
      logger.info('User found in Enlace', {
        numeroDocumento,
        enlaceUserId: userData.enlaceUserId,
        nombre: userData.nombre,
        estado: userData.estado,
      });

      return {
        found: true,
        ...userData,
      };
    }

    // Table exists but couldn't extract data - assume user might exist
    logger.warn('Table exists but could not extract user data');
    await browserManager.takeScreenshot(page, 'search-extraction-failed');

    return { found: true }; // Conservative: assume found if table exists

  } catch (error) {
    logger.error('Error searching user', { numeroDocumento, error });
    await browserManager.takeScreenshot(page, 'search-critical-error');

    // Re-throw error for caller to handle
    throw error;
  }
}

/**
 * Quick check if user exists in Enlace
 * @param numeroDocumento - Document number to check
 * @returns true if user exists, false otherwise
 */
export async function usuarioExiste(numeroDocumento: string): Promise<boolean> {
  try {
    const result = await buscarUsuario(numeroDocumento);
    return result.found;
  } catch (error) {
    logger.error('Error checking if user exists', { numeroDocumento, error });
    return false;
  }
}

/**
 * Legacy compatibility - search with page parameter
 * @deprecated Use buscarUsuario() instead
 */
export async function buscarUsuarioEnlace(
  page: Page,
  payload: { numeroDocumento: string }
): Promise<{ success: boolean; data?: SearchResult; error?: string }> {
  try {
    const result = await buscarUsuario(payload.numeroDocumento);
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown search error',
    };
  }
}

/**
 * Legacy compatibility - check existence with page parameter
 * @deprecated Use usuarioExiste() instead
 */
export async function usuarioExisteEnlace(
  page: Page,
  numeroDocumento: string
): Promise<boolean> {
  return usuarioExiste(numeroDocumento);
}
