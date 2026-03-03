/**
 * Browser Manager for Puppeteer
 * Handles browser lifecycle, configuration, and utilities
 */

import puppeteerExtra from 'puppeteer-extra';
import { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';
import path from 'path';
import fs from 'fs/promises';

// Enable stealth plugin to avoid bot detection
puppeteerExtra.use(StealthPlugin());

export interface BrowserConfig {
  headless?: boolean;
  downloadsPath?: string;
  userDataDir?: string;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private downloadsPath: string;

  constructor(private browserConfig: BrowserConfig = {}) {
    this.downloadsPath = browserConfig.downloadsPath || './downloads';
  }

  async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    logger.info('Launching browser', { headless: config.puppeteer.headless });

    try {
      // Create downloads directory if it doesn't exist
      await fs.mkdir(this.downloadsPath, { recursive: true });

      logger.debug('Launching puppeteer...');

      const isHeadless = this.browserConfig.headless ?? config.puppeteer.headless;

      this.browser = await puppeteerExtra.launch({
        headless: isHeadless,
        // Use system Chrome for non-headless mode (fixes socket hang up issue on macOS)
        ...(isHeadless === false && { channel: 'chrome' }),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
        ...(this.browserConfig.userDataDir && {
          userDataDir: this.browserConfig.userDataDir,
        }),
      });

      logger.info('Browser launched successfully');

      return this.browser;
    } catch (error) {
      // Log the full error details
      let errorMessage = 'Unknown error';
      let errorStack = undefined;

      if (error instanceof Error) {
        errorMessage = error.message;
        errorStack = error.stack;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error, null, 2);
      } else {
        errorMessage = String(error);
      }

      logger.error('Failed to launch browser', {
        error: errorMessage,
        stack: errorStack,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
      });
      throw new Error(`Browser launch failed: ${errorMessage}`);
    }
  }

  async newPage(): Promise<Page> {
    const browser = await this.launch();
    const page = await browser.newPage();

    // Configure user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
    });

    // Anti-detection: Remove webdriver property and other bot signals
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['es-CO', 'es', 'en-US', 'en'],
      });

      // Override plugins to look more real
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
      });

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied', onchange: null } as PermissionStatus)
          : originalQuery(parameters);

      // Add chrome object if missing
      if (!(window as unknown as Record<string, unknown>).chrome) {
        (window as unknown as Record<string, unknown>).chrome = {
          runtime: {},
        };
      }
    });

    // Configure downloads
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: this.downloadsPath,
    });

    // Configure timeouts
    page.setDefaultTimeout(config.puppeteer.timeout);
    page.setDefaultNavigationTimeout(config.puppeteer.timeout);

    return page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
    }
  }

  async takeScreenshot(page: Page, name: string): Promise<string> {
    const screenshotsDir = './screenshots';
    await fs.mkdir(screenshotsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}_${timestamp}.png`;
    const filepath = path.join(screenshotsDir, filename);

    await page.screenshot({ path: filepath, fullPage: true });

    logger.info('Screenshot saved', { filepath });
    return filepath;
  }
}

// Singleton instance
export const browserManager = new BrowserManager();

/**
 * Legacy functions for backward compatibility
 */
export async function createBrowser(): Promise<Browser> {
  return browserManager.launch();
}

export async function createPage(_browser: Browser): Promise<Page> {
  return browserManager.newPage();
}

export async function takeScreenshot(page: Page, name: string): Promise<string> {
  return browserManager.takeScreenshot(page, name);
}

export async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close();
  logger.info('Browser closed successfully');
}
