/**
 * Browser Manager for Puppeteer
 * Handles browser lifecycle, configuration, and utilities
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { addExtra } from 'puppeteer-extra';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';
import path from 'path';
import fs from 'fs/promises';

// Apply stealth plugin
const puppeteerExtra = addExtra(puppeteer);
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

    // Create downloads directory if it doesn't exist
    await fs.mkdir(this.downloadsPath, { recursive: true });

    this.browser = await puppeteerExtra.launch({
      headless: this.browserConfig.headless ?? config.puppeteer.headless,
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

export async function createPage(browser: Browser): Promise<Page> {
  return browserManager.newPage();
}

export async function takeScreenshot(page: Page, name: string): Promise<string> {
  return browserManager.takeScreenshot(page, name);
}

export async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close();
  logger.info('Browser closed successfully');
}
