import { PrismaClient } from '@prisma/client';
import { localStorage } from './local';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export async function uploadTaskFile(
  taskId: string,
  file: Buffer,
  filename: string,
  fileType: string
): Promise<string> {
  try {
    // Save file to storage
    const filePath = await localStorage.saveFile(file, filename, `tasks/${taskId}`);
    const fileUrl = localStorage.getPublicUrl(filePath);
    const fileSize = file.length;

    // Create TaskFile record
    await prisma.taskFile.create({
      data: {
        taskId,
        fileName: filename,
        fileType,
        filePath,
        fileUrl,
        fileSize,
      },
    });

    logger.info(`Task file uploaded: ${filename} for task ${taskId}`);
    return fileUrl;
  } catch (error) {
    logger.error('Error uploading task file:', error);
    throw error;
  }
}

export async function getTaskFiles(taskId: string) {
  return await prisma.taskFile.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteTaskFile(fileId: string): Promise<void> {
  try {
    const file = await prisma.taskFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    // Delete from storage
    await localStorage.deleteFile(file.filePath);

    // Delete from database
    await prisma.taskFile.delete({
      where: { id: fileId },
    });

    logger.info(`Task file deleted: ${fileId}`);
  } catch (error) {
    logger.error('Error deleting task file:', error);
    throw error;
  }
}
