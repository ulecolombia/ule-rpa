import fs from 'fs/promises';
import path from 'path';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

export class LocalStorage {
  private basePath: string;

  constructor() {
    this.basePath = config.storage.path;
  }

  async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error(`Error creating directory ${dir}:`, error);
      throw error;
    }
  }

  async saveFile(file: Buffer, filename: string, subfolder: string = ''): Promise<string> {
    try {
      const dir = path.join(this.basePath, subfolder);
      await this.ensureDirectory(dir);

      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, file);

      logger.info(`File saved: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Error saving file:', error);
      throw error;
    }
  }

  async getFile(filepath: string): Promise<Buffer> {
    try {
      return await fs.readFile(filepath);
    } catch (error) {
      logger.error(`Error reading file ${filepath}:`, error);
      throw error;
    }
  }

  async deleteFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
      logger.info(`File deleted: ${filepath}`);
    } catch (error) {
      logger.error(`Error deleting file ${filepath}:`, error);
      throw error;
    }
  }

  async fileExists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  getPublicUrl(filepath: string): string {
    const relativePath = filepath.replace(this.basePath, '');
    return `${config.storage.baseUrl}${relativePath}`;
  }
}

export const localStorage = new LocalStorage();
