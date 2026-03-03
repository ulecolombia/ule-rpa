/**
 * Bot Errors - Re-export from main utils
 * For convenient imports within bots directory
 */

export { BotError, EnlaceError, AppError } from '../../utils/errors';

/**
 * SOI Error - Specific error for SOI automation
 */
export class SOIError extends Error {
  public readonly botType: string = 'soi';
  public readonly screenshot?: string;
  public readonly pageUrl?: string;

  constructor(
    message: string,
    screenshot?: string,
    pageUrl?: string,
  ) {
    super(message);
    this.name = 'SOIError';
    this.screenshot = screenshot;
    this.pageUrl = pageUrl;
  }
}
