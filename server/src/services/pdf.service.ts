import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import logger from '../utils/logger';

export const pdfService = {
  async extractText(filePath: string): Promise<{ text: string; hasText: boolean }> {
    try {
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      const text = data.text.trim();
      return {
        text,
        hasText: text.length > 50,
      };
    } catch (err: any) {
      logger.error('PDF 文本提取失败:', err);
      return { text: '', hasText: false };
    }
  },

  async toBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  },
};
