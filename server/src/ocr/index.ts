import type { OcrRecognizedResult } from '../types';
import { parseInvoiceDocument, parseInvoiceText } from './invoice-parser';
import { tesseractProvider } from './tesseract.provider';
import type { InvoiceParseResult, KnownSupplier } from './types';

export interface LocalInvoiceOcrResult extends InvoiceParseResult {
  engine: 'tesseract';
  raw: OcrRecognizedResult;
}

/**
 * 本地发票 OCR 插件的唯一入口。
 *
 * 不依赖任何云端 AI：Tesseract 负责「看图识字」，invoice-parser 负责把文字按
 * 发票结构（表头列、明细行、金额勾稽、供应商）整理成数据库可用的结构。
 * 插件只返回识别结果；落库仍由 ocr.service 统一处理，保证与 AI 模式同一条链路。
 */
export const localInvoiceOcr = {
  getStatus: tesseractProvider.getStatus,

  async recognizeInvoice(
    filePath: string,
    fileType: 'image' | 'pdf',
    knownSuppliers: KnownSupplier[] = []
  ): Promise<LocalInvoiceOcrResult> {
    const document = await tesseractProvider.recognize(filePath, fileType);
    const parsed = parseInvoiceDocument(document, { knownSuppliers, source: 'ocr' });
    return {
      ...parsed,
      engine: 'tesseract',
      raw: parsed.recognized,
      diagnostics: {
        ...parsed.diagnostics,
        warnings: parsed.diagnostics.warnings,
      },
    };
  },

  parseText(text: string, knownSuppliers: KnownSupplier[] = []): InvoiceParseResult {
    return parseInvoiceText(text, { knownSuppliers });
  },

  renderPdfPageForVision: tesseractProvider.renderFirstPageJpeg,
};

export type { InvoiceParseResult, LocalOcrStatus, KnownSupplier } from './types';
