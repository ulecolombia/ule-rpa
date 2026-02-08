/**
 * Wait Helpers for Puppeteer
 * Utilities for waiting and interacting with page elements
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger';

export async function waitAndClick(
  page: Page,
  selector: string,
  options: { timeout?: number; visible?: boolean } = {}
): Promise<void> {
  const timeout = options.timeout || 10000;
  const waitOptions = options.visible ? { visible: true, timeout } : { timeout };

  logger.debug('Waiting for element to click', { selector });

  await page.waitForSelector(selector, waitOptions);
  await page.click(selector);

  logger.debug('Clicked element', { selector });
}

export async function waitAndType(
  page: Page,
  selector: string,
  text: string,
  options: { delay?: number; clear?: boolean } = {}
): Promise<void> {
  logger.debug('Waiting for input to type', { selector });

  await page.waitForSelector(selector);

  if (options.clear) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
  }

  await page.type(selector, text, { delay: options.delay || 50 });

  logger.debug('Typed text into input', { selector, textLength: text.length });
}

export async function waitForNavigation(
  page: Page,
  options: { timeout?: number; waitUntil?: any } = {}
): Promise<void> {
  const timeout = options.timeout || 30000;
  const waitUntil = options.waitUntil || 'networkidle0';

  logger.debug('Waiting for navigation');

  await page.waitForNavigation({ waitUntil, timeout });

  logger.debug('Navigation complete', { url: page.url() });
}

export async function waitForText(
  page: Page,
  text: string,
  timeout: number = 10000
): Promise<void> {
  logger.debug('Waiting for text on page', { text });

  await page.waitForFunction(
    (searchText) => document.body.innerText.includes(searchText),
    { timeout },
    text
  );

  logger.debug('Text found on page', { text });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for selector with visibility option
 */
export async function waitForSelector(
  page: Page,
  selector: string,
  timeout: number = 10000
): Promise<void> {
  await page.waitForSelector(selector, { timeout, visible: true });
}

/**
 * Retry operation with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 2000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        logger.warn(`Attempt ${attempt} failed, retrying...`, { error: lastError.message });
        await sleep(delay * attempt); // Exponential backoff
      }
    }
  }

  throw lastError;
}

/**
 * Random delay to simulate human behavior
 */
export async function randomDelay(min: number = 500, max: number = 1500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await sleep(delay);
}

/**
 * Type text with random delays between keystrokes (human-like)
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(Math.random() * 100 + 50); // 50-150ms between characters
  }
}

/**
 * Select option from dropdown
 */
export async function selectOption(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  logger.debug('Selecting option', { selector, value });

  await page.waitForSelector(selector);
  await page.select(selector, value);

  logger.debug('Option selected', { selector, value });
}

/**
 * Wait for element to be hidden
 */
export async function waitForHidden(
  page: Page,
  selector: string,
  timeout: number = 10000
): Promise<void> {
  logger.debug('Waiting for element to be hidden', { selector });

  await page.waitForSelector(selector, { hidden: true, timeout });

  logger.debug('Element is hidden', { selector });
}

/**
 * Check if element exists (without throwing error)
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get text content from element
 */
export async function getTextContent(page: Page, selector: string): Promise<string> {
  await page.waitForSelector(selector);
  const element = await page.$(selector);

  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  const text = await page.evaluate((el) => el.textContent || '', element);
  return text.trim();
}

/**
 * Get value from input element
 */
export async function getInputValue(page: Page, selector: string): Promise<string> {
  await page.waitForSelector(selector);
  const value = await page.$eval(selector, (el: any) => el.value);
  return value;
}

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageLoad(page: Page, timeout: number = 30000): Promise<void> {
  // Puppeteer uses waitForNavigation instead of waitForLoadState
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout });
}

/**
 * Scroll to element
 */
export async function scrollToElement(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector);
  await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, selector);
  await sleep(500); // Wait for scroll to complete
}
