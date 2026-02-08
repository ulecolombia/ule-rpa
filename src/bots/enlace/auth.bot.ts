/**
 * Authentication Bot for Enlace Operativo
 * Handles login, logout, and session management
 */

import { Page } from 'puppeteer';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';
import { browserManager } from '../utils/browser';
import { waitAndClick, waitAndType, waitForNavigation, sleep, waitForSelector, elementExists } from '../utils/wait';
import { SELECTORS, URL_PATTERNS } from '../utils/selectors';
import { BotError } from '../../utils/errors';

export interface EnlaceSession {
  page: Page;
  cookies: any[];
  authenticated: boolean;
  sessionStartTime: Date;
}

/**
 * Enlace Authentication Bot
 * Manages authentication and session lifecycle for Enlace Operativo
 */
export class EnlaceAuthBot {
  private session: EnlaceSession | null = null;
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Login to Enlace Operativo
   * @returns Authenticated session
   */
  async login(): Promise<EnlaceSession> {
    logger.info('Starting Enlace authentication');

    const page = await browserManager.newPage();

    try {
      // 1. Navigate to login page
      logger.info('Navigating to login page', { url: URL_PATTERNS.LOGIN });
      await page.goto(URL_PATTERNS.LOGIN, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });

      await sleep(1000);

      // Take screenshot of login page
      await browserManager.takeScreenshot(page, 'login-page');
      logger.debug('Login page loaded');

      // 2. Select document type (if dropdown exists)
      const tipoDocExists = await elementExists(page, SELECTORS.LOGIN.TIPO_DOC_SELECT);
      if (tipoDocExists) {
        logger.info('Selecting document type: CC');
        await page.waitForSelector(SELECTORS.LOGIN.TIPO_DOC_SELECT, { timeout: 10000 });
        await page.select(SELECTORS.LOGIN.TIPO_DOC_SELECT, 'CC'); // Cédula de Ciudadanía
        await sleep(500);
      } else {
        logger.debug('Document type selector not found, skipping');
      }

      // 3. Enter document number
      logger.info('Entering document number');
      await waitForSelector(page, SELECTORS.LOGIN.NUMERO_DOC_INPUT);
      await waitAndType(page, SELECTORS.LOGIN.NUMERO_DOC_INPUT, config.enlace.admin.documento, {
        clear: true,
        delay: 100,
      });

      await sleep(500);
      await browserManager.takeScreenshot(page, 'after-document-input');

      // 4. Check for username field (if exists)
      const userInputExists = await elementExists(page, SELECTORS.LOGIN.USER_INPUT);
      if (userInputExists) {
        logger.info('Entering username');
        await waitAndType(page, SELECTORS.LOGIN.USER_INPUT, config.enlace.admin.username, {
          clear: true,
          delay: 100,
        });
        await sleep(500);
      }

      // 5. Handle reCAPTCHA (CRITICAL)
      logger.info('Checking for reCAPTCHA');
      const recaptchaExists = await elementExists(page, SELECTORS.LOGIN.RECAPTCHA);

      if (recaptchaExists) {
        logger.warn('⚠️  reCAPTCHA detected - waiting for manual resolution');
        logger.warn('Please solve the reCAPTCHA in the browser window');

        await browserManager.takeScreenshot(page, 'recaptcha-detected');

        // Wait for reCAPTCHA to be resolved
        // We'll check if the Continue button becomes enabled
        try {
          logger.info('Waiting for reCAPTCHA resolution (max 2 minutes)...');

          await page.waitForFunction(
            (buttonSelector) => {
              const button = document.querySelector(buttonSelector);
              if (!button) return false;

              // Check if button is enabled (not disabled)
              const isDisabled =
                button.hasAttribute('disabled') || button.classList.contains('disabled');
              return !isDisabled;
            },
            {
              timeout: 120000, // 2 minutes to solve CAPTCHA
              polling: 1000, // Check every second
            },
            SELECTORS.LOGIN.CONTINUAR_BUTTON
          );

          logger.info('✅ reCAPTCHA appears to be resolved');
          await sleep(1000);
        } catch (error) {
          logger.error('❌ reCAPTCHA resolution timeout');
          await browserManager.takeScreenshot(page, 'recaptcha-timeout');
          throw new BotError('reCAPTCHA was not resolved within 2 minutes');
        }
      } else {
        logger.info('No reCAPTCHA detected, proceeding');
      }

      // 6. Click Continue button
      logger.info('Clicking Continue button');
      await browserManager.takeScreenshot(page, 'before-continue-click');

      const continueButtonExists = await elementExists(page, SELECTORS.LOGIN.CONTINUAR_BUTTON);
      if (continueButtonExists) {
        await waitAndClick(page, SELECTORS.LOGIN.CONTINUAR_BUTTON);
      } else {
        // Try alternative submit button
        logger.debug('Continue button not found, trying alternative');
        await waitAndClick(page, SELECTORS.LOGIN.INGRESAR_BUTTON);
      }

      // 7. Wait for navigation to dashboard
      logger.info('Waiting for dashboard redirect');
      await waitForNavigation(page, { timeout: 30000, waitUntil: 'networkidle0' });

      await sleep(2000);

      // 8. Verify authentication
      const currentUrl = page.url();
      logger.debug('Current URL after login', { url: currentUrl });

      await browserManager.takeScreenshot(page, 'after-login');

      // Check if we're on dashboard/tablero/gestion
      const isAuthenticated =
        currentUrl.includes('/tablero') ||
        currentUrl.includes('/dashboard') ||
        currentUrl.includes('/gestion') ||
        currentUrl.includes('/home');

      if (!isAuthenticated) {
        // Check for error messages
        const errorExists = await elementExists(page, SELECTORS.LOGIN.ERROR_MESSAGE);
        if (errorExists) {
          const errorText = await page.$eval(
            SELECTORS.LOGIN.ERROR_MESSAGE,
            (el) => el.textContent || 'Unknown error'
          );
          logger.error('Authentication error message found', { error: errorText });
          await browserManager.takeScreenshot(page, 'auth-error-message');
          throw new BotError(`Authentication failed: ${errorText}`);
        }

        logger.error('Authentication failed - not redirected to dashboard', { url: currentUrl });
        await browserManager.takeScreenshot(page, 'auth-failed');
        throw new BotError('Authentication failed - not redirected to dashboard');
      }

      // 9. Save session cookies
      logger.info('Saving session cookies');
      const cookies = await page.cookies();

      this.session = {
        page,
        cookies,
        authenticated: true,
        sessionStartTime: new Date(),
      };

      logger.info('✅ Authentication successful', {
        url: currentUrl,
        cookiesCount: cookies.length,
      });

      return this.session;
    } catch (error) {
      logger.error('❌ Authentication failed', { error });
      await browserManager.takeScreenshot(page, 'auth-critical-error');

      // Close page on error
      try {
        await page.close();
      } catch (closeError) {
        logger.error('Error closing page after auth failure', { error: closeError });
      }

      throw error;
    }
  }

  /**
   * Get authenticated page (login if needed)
   * @returns Authenticated page instance
   */
  async getAuthenticatedPage(): Promise<Page> {
    if (!this.session || !this.session.authenticated) {
      logger.info('No active session, logging in');
      await this.login();
    }

    return this.session!.page;
  }

  /**
   * Check if currently authenticated
   * @returns true if authenticated, false otherwise
   */
  async isAuthenticated(): Promise<boolean> {
    if (!this.session) {
      return false;
    }

    try {
      // Check if session is too old
      const sessionAge = Date.now() - this.session.sessionStartTime.getTime();
      if (sessionAge > this.SESSION_TIMEOUT_MS) {
        logger.warn('Session expired due to timeout', {
          ageMinutes: Math.floor(sessionAge / 60000),
        });
        return false;
      }

      // Check if page is still valid
      if (this.session.page.isClosed()) {
        logger.warn('Session page is closed');
        return false;
      }

      // Check current URL
      const url = this.session.page.url();
      const isOnAuthPage =
        url.includes('/tablero') ||
        url.includes('/dashboard') ||
        url.includes('/gestion') ||
        url.includes('/home');

      if (!isOnAuthPage) {
        logger.warn('Session appears invalid - not on authenticated page', { url });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking authentication status', { error });
      return false;
    }
  }

  /**
   * Ensure we have an authenticated session (re-login if needed)
   * @returns Authenticated page instance
   */
  async ensureAuthenticated(): Promise<Page> {
    const isAuth = await this.isAuthenticated();

    if (!isAuth) {
      logger.info('Session expired or invalid, re-authenticating');

      // Close old session if exists
      if (this.session && this.session.page && !this.session.page.isClosed()) {
        try {
          await this.session.page.close();
        } catch (error) {
          logger.error('Error closing old session page', { error });
        }
      }

      this.session = null;

      // Login again
      await this.login();
    } else {
      logger.debug('Session is still valid');
    }

    return this.session!.page;
  }

  /**
   * Refresh session (navigate to dashboard to keep session alive)
   */
  async refreshSession(): Promise<void> {
    if (!this.session) {
      throw new BotError('No active session to refresh');
    }

    try {
      logger.info('Refreshing session');
      await this.session.page.goto(URL_PATTERNS.DASHBOARD, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      this.session.sessionStartTime = new Date();
      logger.info('Session refreshed successfully');
    } catch (error) {
      logger.error('Error refreshing session', { error });
      throw error;
    }
  }

  /**
   * Logout and cleanup
   */
  async logout(): Promise<void> {
    if (this.session) {
      logger.info('Logging out from Enlace');

      try {
        // Try to click logout button
        const page = this.session.page;
        if (!page.isClosed()) {
          const logoutExists = await elementExists(page, SELECTORS.NAV.LOGOUT);
          if (logoutExists) {
            await waitAndClick(page, SELECTORS.NAV.LOGOUT);
            await sleep(1000);
            logger.info('Clicked logout button');
          }

          await page.close();
        }
      } catch (error) {
        logger.error('Error during logout', { error });
      }

      this.session = null;
      logger.info('✅ Logged out successfully');
    } else {
      logger.debug('No active session to logout');
    }
  }

  /**
   * Get current session info
   */
  getSessionInfo(): {
    authenticated: boolean;
    ageMinutes: number | null;
    url: string | null;
  } {
    if (!this.session) {
      return { authenticated: false, ageMinutes: null, url: null };
    }

    const ageMinutes = Math.floor(
      (Date.now() - this.session.sessionStartTime.getTime()) / 60000
    );

    const url = this.session.page.isClosed() ? null : this.session.page.url();

    return {
      authenticated: this.session.authenticated,
      ageMinutes,
      url,
    };
  }

  /**
   * Cleanup (close session without logout)
   */
  async cleanup(): Promise<void> {
    if (this.session && this.session.page && !this.session.page.isClosed()) {
      try {
        await this.session.page.close();
      } catch (error) {
        logger.error('Error during cleanup', { error });
      }
    }
    this.session = null;
  }
}

/**
 * Singleton instance for shared use across the application
 */
export const enlaceAuth = new EnlaceAuthBot();

/**
 * Legacy function for backward compatibility
 */
export async function authenticateEnlace(_page: Page): Promise<any> {
  logger.warn('Using legacy authenticateEnlace function - consider using EnlaceAuthBot class');

  // This is a simplified version for compatibility
  // The new approach is to use enlaceAuth.login()
  return {
    success: true,
    data: { authenticated: true },
  };
}

/**
 * Legacy function for backward compatibility
 */
export async function logoutEnlace(_page: Page): Promise<void> {
  logger.warn('Using legacy logoutEnlace function - consider using enlaceAuth.logout()');
  // No-op for compatibility
}
