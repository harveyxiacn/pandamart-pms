import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { pdfService } from './pdf.service';
import { excelService } from './excel.service';
import { llmService } from './llm.service';
import { aliasService } from './alias.service';
import { ProductModel } from '../models/Product';
import { SupplierModel } from '../models/Supplier';
import { InvoiceModel } from '../models/Invoice';
import { InvoiceItemModel } from '../models/InvoiceItem';
import { OcrRecognizedResult, OcrRecognizedItem, OcrMethod, FileType } from '../types';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

// 魔数（文件签名）校验：仅凭扩展名/MIME 不可信，磁盘落地后读取首字节核对真实类型，
// 阻止伪造扩展名的恶意字节流到达 pdf-parse / sharp / xlsx 解析器。
function readFileHeader(filePath: string, length: number): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

// 各扩展名允许的文件签名（首字节十六进制序列）
const FILE_SIGNATURES: Record<string, number[][]> = {
  '.pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  '.jpg': [[0xff, 0xd8, 0xff]], // JPEG
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.png': [[0x89, 0x50, 0x4e, 0x47]], // PNG
  '.xlsx': [[0x50, 0x4b, 0x03, 0x04]], // ZIP(OOXML)
  '.xls': [[0xd0, 0xcf, 0x11, 0xe0]], // OLE/CFBF
};

function assertMagicBytes(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  const signatures = FILE_SIGNATURES[ext];
  if (!signatures) {
    throw new AppError(400, 'INVALID_FILE', `不支持的文件类型: ${ext}`);
  }
  const maxLen = Math.max(...signatures.map((sig) => sig.length));
  const header = readFileHeader(filePath, maxLen);
  const matched = signatures.some(
    (sig) => header.length >= sig.length && sig.every((byte, i) => header[i] === byte)
  );
  if (!matched) {
    throw new AppError(400, 'INVALID_FILE', '文件内容与扩展名不符，疑似伪造文件类型');
  }
}

const INVOICE_OCR_PROMPT = `你是一个专业的发票数据提取助手。请分析这张发票图片，提取以下信息并以JSON格式返回：

{
  "supplier_name": "供应商名称",
  "supplier_code": "供应商编号（如有）",
  "supplier_address": "供应商地址（如有）",
  "supplier_contact": "供应商联系方式（电话/传真/邮箱，如有）",
  "invoice_number": "发票编号",
  "invoice_date": "YYYY-MM-DD格式日期",
  "customer_code": "客户编号（如有）",
  "items": [
    {
      "product_name_en": "英文名",
      "product_name_zh": "中文名",
      "product_code": "产品代码/货号（Code列）",
      "product_number": "产品编号/条码（Number或括号内数字）",
      "un": "UN/单位标识（如 EA/CSE/CSH）",
      "tax_code": "Tax列（E=无税，H=有税）",
      "quantity": 数量,
      "unit": "单位",
      "unit_price": 单价,
      "line_total": 行小计
    }
  ],
  "sales_total": 税前销售额,
  "tax_total": 税额,
  "total": 含税总价,
  "subtotal": 税前小计,
  "has_tax": true/false,
  "tax_amount": 税额,
  "grand_total": 含税总价
}

注意事项：
1. 产品名称可能是中英文混合，请分开提取
2. Tax 列仅允许 E 或 H：E=无税，H=有税
3. 必须尽量提取产品 code / number / UN
4. 数量和金额请转为数字类型
5. 如果某个字段无法识别，设为null
6. 日期统一转为YYYY-MM-DD格式
7. 仅返回JSON，不要包含其他文字`;

const TEXT_PARSE_PROMPT = `你是一个专业的发票文本解析助手。以下是从PDF提取的文本内容，请解析并以JSON格式返回结构化数据：

{
  "supplier_name": "供应商名称",
  "supplier_code": "供应商编号（如有）",
  "supplier_address": "供应商地址（如有）",
  "supplier_contact": "供应商联系方式（电话/传真/邮箱，如有）",
  "invoice_number": "发票编号",
  "invoice_date": "YYYY-MM-DD格式日期",
  "customer_code": "客户编号（如有）",
  "items": [
    {
      "product_name_en": "英文名",
      "product_name_zh": "中文名（如有）",
      "product_code": "产品代码/货号（Code列）",
      "product_number": "产品编号/条码（Number或括号内数字）",
      "un": "UN/单位标识（如 EA/CSE/CSH）",
      "tax_code": "Tax列（E=无税，H=有税）",
      "quantity": 数量,
      "unit": "单位",
      "unit_price": 单价,
      "line_total": 行小计
    }
  ],
  "sales_total": 税前销售额,
  "tax_total": 税额,
  "total": 含税总价,
  "subtotal": 税前小计,
  "has_tax": true/false,
  "tax_amount": 税额,
  "grand_total": 含税总价
}

注意：仅返回JSON，不要包含其他文字。

发票文本内容：
`;

export const ocrService = {
  detectFileType(filePath: string): FileType {
    const ext = path.extname(filePath).toLowerCase();
    // 真正的类型闸门：先按魔数核对真实类型，再按扩展名分发（upload.ts 的 octet-stream 容错仍保留但不再是唯一防线）
    assertMagicBytes(filePath);
    if (ext === '.pdf') return 'pdf';
    if (['.jpg', '.jpeg', '.png'].includes(ext)) return 'image';
    if (['.xlsx', '.xls'].includes(ext)) return 'excel';
    throw new Error(`不支持的文件类型: ${ext}`);
  },

  getImageMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'image/jpeg';
  },

  async prepareImageForVision(filePath: string): Promise<{ base64: string; mimeType: string }> {
    const rawBuffer = await fs.promises.readFile(filePath);
    const originalMimeType = this.getImageMimeType(filePath);

    try {
      const image = sharp(rawBuffer, { failOn: 'none' });
      const metadata = await image.metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const needOptimize = rawBuffer.length > 1.5 * 1024 * 1024 || width > 2200 || height > 2200;

      if (!needOptimize) {
        return { base64: rawBuffer.toString('base64'), mimeType: originalMimeType };
      }

      const optimizedBuffer = await sharp(rawBuffer, { failOn: 'none' })
        .rotate()
        .resize({
          width: 2200,
          height: 2200,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();

      logger.info(`OCR 图片已预压缩: ${path.basename(filePath)} ${rawBuffer.length} -> ${optimizedBuffer.length} bytes`);
      return { base64: optimizedBuffer.toString('base64'), mimeType: 'image/jpeg' };
    } catch (err: any) {
      logger.warn(`OCR 图片预处理失败，使用原图: ${err?.message || 'unknown'}`);
      return { base64: rawBuffer.toString('base64'), mimeType: originalMimeType };
    }
  },

  async processFile(
    filePath: string,
    userId: number
  ): Promise<{
    invoiceId: number;
    ocrMethod: OcrMethod;
    recognized: OcrRecognizedResult;
    filePath: string;
    fileType: FileType;
  }> {
    const fileType = this.detectFileType(filePath);
    let ocrMethod: OcrMethod;
    let recognized: OcrRecognizedResult;

    switch (fileType) {
      case 'pdf':
        ({ ocrMethod, recognized } = await this.processPdf(filePath));
        break;
      case 'image':
        ocrMethod = 'ai_vision';
        recognized = await this.processImage(filePath);
        break;
      case 'excel':
        ocrMethod = 'excel_parse';
        recognized = excelService.parseInvoice(filePath);
        break;
      default:
        throw new Error(`不支持的文件类型: ${fileType}`);
    }

    // 先解析供应商：商品匹配要用 supplierId 查「供应商别名学习」映射，故必须排在匹配之前
    let supplierId: number | null = null;
    if (recognized.supplierName) {
      const supplier = await SupplierModel.findByName(recognized.supplierName);
      if (supplier) {
        supplierId = supplier.id;
      }
    }

    // 智能匹配已有产品（优先用已学习的别名映射，其次条码精确命中，最后名称模糊匹配）
    recognized.items = await this.matchProducts(recognized.items, supplierId);

    // 创建发票记录（pending 状态）
    const relativePath = filePath.replace(/\\/g, '/');
    const invoiceId = await InvoiceModel.create({
      supplier_id: supplierId,
      invoice_number: recognized.invoiceNumber || `AUTO-${Date.now()}`,
      invoice_date: new Date(recognized.invoiceDate || new Date()),
      customer_code: recognized.customerCode,
      subtotal: recognized.subtotal,
      has_tax: recognized.hasTax,
      tax_amount: recognized.taxAmount,
      grand_total: recognized.grandTotal,
      file_path: relativePath,
      file_type: fileType,
      ocr_method: ocrMethod,
      ocr_raw_result: JSON.stringify(recognized),
      status: 'pending',
      uploaded_by: userId,
    });

    // 创建发票明细（临时）—— 批量插入，避免逐条 INSERT
    if (recognized.items.length > 0) {
      await InvoiceItemModel.createMany(
        recognized.items.map((item) => ({
          invoice_id: invoiceId,
          product_id: item.matchedProduct?.id || null,
          raw_name_en: item.productNameEn,
          raw_name_zh: item.productNameZh,
          raw_product_code: item.productCode,
          raw_product_number: item.productNumber,
          raw_un: item.un,
          raw_tax_code: item.taxCode,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
          matched_confidence: item.matchedProduct?.confidence || null,
        }))
      );
    }

    return {
      invoiceId,
      ocrMethod,
      recognized,
      filePath: relativePath,
      fileType,
    };
  },

  async processPdf(filePath: string): Promise<{ ocrMethod: OcrMethod; recognized: OcrRecognizedResult }> {
    const { text, hasText } = await pdfService.extractText(filePath);

    if (hasText) {
      // 文本型 PDF → 先尝试模板，再用 LLM 解析
      try {
        const recognized = await this.parseTextWithLlm(text);
        return { ocrMethod: 'text_extract', recognized };
      } catch (err) {
        logger.warn('PDF 文本 LLM 解析失败，降级为 Vision:', err);
      }
    }

    // 扫描型 PDF 或文本解析失败 → 转图片用 Vision
    const base64 = await pdfService.toBase64(filePath);
    const recognized = await this.processImageBase64(base64);
    return { ocrMethod: 'ai_vision', recognized };
  },

  async parseTextWithLlm(text: string): Promise<OcrRecognizedResult> {
    const response = await llmService.chatCompletion('ocr', [
      { role: 'user', content: TEXT_PARSE_PROMPT + text },
    ], { temperature: 0.1 });

    return this.parseAiResponse(response, text);
  },

  async processImage(filePath: string): Promise<OcrRecognizedResult> {
    const prepared = await this.prepareImageForVision(filePath);
    return this.processImageBase64(prepared.base64, prepared.mimeType);
  },

  async processImageBase64(base64: string, mimeType: string = 'image/jpeg'): Promise<OcrRecognizedResult> {
    const response = await llmService.visionCompletion(base64, INVOICE_OCR_PROMPT, mimeType);
    return this.parseAiResponse(response);
  },

  parseAiResponse(response: string, sourceText?: string): OcrRecognizedResult {
    // 尝试从响应中提取 JSON
    let jsonStr = response.trim();

    // 移除 markdown 代码块标记
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const data = JSON.parse(jsonStr);
      let recognized: OcrRecognizedResult = {
        supplierName: data.supplier_name || null,
        supplierCode: data.supplier_code || null,
        supplierAddress: data.supplier_address || null,
        supplierContact: data.supplier_contact || data.supplier_phone || data.supplier_email || null,
        invoiceNumber: data.invoice_number || `AI-${Date.now()}`,
        invoiceDate: this.normalizeDate(data.invoice_date) || new Date().toISOString().split('T')[0],
        customerCode: data.customer_code || null,
        items: (data.items || []).map((item: any) => ({
          productNameEn: item.product_name_en || item.name || '',
          productNameZh: item.product_name_zh || null,
          productCode: item.product_code || item.productCode || item.code || null,
          productNumber: item.product_number || item.productNumber || item.barcode || null,
          un: item.un || item.UN || item.unit_mark || item.unitMark || null,
          taxCode: this.normalizeTaxCode(item.tax_code || item.taxCode || item.tax),
          quantity: Number(item.quantity) || 0,
          unit: item.unit || item.un || 'Case',
          unitPrice: Number(item.unit_price) || 0,
          lineTotal: Number(item.line_total) || (Number(item.quantity) * Number(item.unit_price)) || 0,
        })),
        salesTotal: data.sales_total !== undefined ? Number(data.sales_total) : (data.subtotal !== undefined ? Number(data.subtotal) : null),
        taxTotal: data.tax_total !== undefined ? Number(data.tax_total) : (data.tax_amount !== undefined ? Number(data.tax_amount) : null),
        total: Number(data.total ?? data.grand_total ?? 0) || 0,
        subtotal: data.subtotal ? Number(data.subtotal) : null,
        hasTax: !!data.has_tax,
        taxAmount: data.tax_amount ? Number(data.tax_amount) : null,
        grandTotal: Number(data.grand_total) || 0,
      };

      recognized = this.normalizeRecognized(recognized);
      if (sourceText) {
        recognized = this.enrichRecognizedFromText(sourceText, recognized);
      }
      return recognized;
    } catch (err) {
      logger.error('AI 响应 JSON 解析失败:', { response: jsonStr.substring(0, 500) });
      throw new Error('AI 识别结果格式异常，请尝试手动录入');
    }
  },

  normalizeDate(value: unknown): string | null {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    const normalized = text.replace(/\//g, '-');
    const direct = new Date(normalized);
    if (!isNaN(direct.getTime())) {
      return direct.toISOString().split('T')[0];
    }

    const m = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const yyyy = m[1];
      const mm = m[2].padStart(2, '0');
      const dd = m[3].padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    return null;
  },

  parseMoney(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const cleaned = String(value).replace(/[^\d.-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  },

  normalizeTaxCode(value: unknown): 'E' | 'H' | null {
    if (!value) return null;
    const upper = String(value).trim().toUpperCase();
    if (!upper) return null;
    if (upper === 'E' || upper.endsWith('E')) return 'E';
    if (upper === 'H' || upper.endsWith('H')) return 'H';
    return null;
  },

  normalizeRecognized(recognized: OcrRecognizedResult): OcrRecognizedResult {
    const normalizedItems = (recognized.items || []).map((item) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const lineTotal = Number(item.lineTotal) || Number((quantity * unitPrice).toFixed(2));
      const unit = (item.unit || item.un || 'Case').toString().trim() || 'Case';
      const un = (item.un || (unit && /^[A-Za-z]{2,4}$/.test(unit) ? unit : null)) as string | null;

      return {
        ...item,
        productNameEn: item.productNameEn || '',
        productNameZh: item.productNameZh || null,
        productCode: item.productCode || null,
        productNumber: item.productNumber || null,
        un: un ? un.toUpperCase() : null,
        taxCode: this.normalizeTaxCode(item.taxCode),
        quantity,
        unit,
        unitPrice,
        lineTotal,
      };
    });

    const itemSalesTotal = Number(
      normalizedItems.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0).toFixed(2)
    );
    const salesTotal = this.parseMoney(recognized.salesTotal) ?? this.parseMoney(recognized.subtotal) ?? itemSalesTotal;
    const taxTotal = this.parseMoney(recognized.taxTotal) ?? this.parseMoney(recognized.taxAmount) ?? 0;
    const total =
      this.parseMoney(recognized.total) ??
      this.parseMoney(recognized.grandTotal) ??
      Number((salesTotal + taxTotal).toFixed(2));
    const itemHasTax = normalizedItems.some((item) => item.taxCode === 'H');
    const hasTax = itemHasTax || taxTotal > 0 || !!recognized.hasTax;

    return {
      ...recognized,
      invoiceDate: this.normalizeDate(recognized.invoiceDate) || new Date().toISOString().split('T')[0],
      supplierAddress: recognized.supplierAddress || null,
      supplierContact: recognized.supplierContact || null,
      items: normalizedItems,
      salesTotal,
      taxTotal,
      total,
      subtotal: salesTotal,
      hasTax,
      taxAmount: taxTotal,
      grandTotal: total,
    };
  },

  enrichRecognizedFromText(text: string, recognized: OcrRecognizedResult): OcrRecognizedResult {
    const supplierInfo = this.extractSupplierInfoFromText(text);
    const totalInfo = this.extractTotalsFromText(text);
    const itemHints = this.extractItemHintsFromText(text);
    const usedHints = new Set<number>();

    const items = recognized.items.map((item) => {
      const hintIndex = this.findItemHintIndex(item, itemHints, usedHints);
      const hint = hintIndex >= 0 ? itemHints[hintIndex] : null;
      if (hintIndex >= 0) {
        usedHints.add(hintIndex);
      }

      const mergedTaxCode = this.normalizeTaxCode(item.taxCode || hint?.taxCode);
      const fallbackTaxCode = mergedTaxCode || ((recognized.taxTotal || recognized.taxAmount || 0) > 0 ? 'H' : 'E');

      return {
        ...item,
        productNameZh: item.productNameZh || hint?.productNameZh || null,
        productNameEn: item.productNameEn || hint?.productNameEn || '',
        productCode: item.productCode || hint?.productCode || null,
        productNumber: item.productNumber || hint?.productNumber || null,
        un: item.un || hint?.un || null,
        taxCode: fallbackTaxCode,
      };
    });

    const supplierAddress =
      recognized.supplierAddress && this.isLikelyAddress(recognized.supplierAddress)
        ? recognized.supplierAddress
        : supplierInfo.supplierAddress;

    return this.normalizeRecognized({
      ...recognized,
      supplierName: recognized.supplierName || supplierInfo.supplierName,
      supplierAddress,
      supplierContact: recognized.supplierContact || supplierInfo.supplierContact,
      salesTotal: totalInfo.salesTotal ?? recognized.salesTotal,
      taxTotal: totalInfo.taxTotal ?? recognized.taxTotal,
      total: totalInfo.total ?? recognized.total,
      items,
    });
  },

  extractSupplierInfoFromText(text: string): {
    supplierName: string | null;
    supplierAddress: string | null;
    supplierContact: string | null;
  } {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const supplierName =
      lines.find((line) => /inc|ltd|trading|company|corp|co\./i.test(line) && !/invoice|facture/i.test(line)) ||
      lines[0] ||
      null;

    const addresses: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/\d+/.test(line) || !/(ave|avenue|rd|road|st|street|blvd|drive|dr|lane|ln|way|court|ct)/i.test(line)) {
        continue;
      }

      let combined = line;
      const next = lines[i + 1] || '';
      if (next && /[A-Za-z].*,\s*[A-Z]{2}\s*[A-Z0-9]{3,}/.test(next)) {
        combined = `${line}, ${next}`;
      }
      if (!addresses.includes(combined)) {
        addresses.push(combined);
      }
      if (addresses.length >= 2) break;
    }

    const contactParts: string[] = [];
    const contactRegex = /(FAX|TEL|PHONE|MOBILE)\s*[:：]?\s*([+()\-\d\s]{6,})/gi;
    let contactMatch: RegExpExecArray | null = contactRegex.exec(text);
    while (contactMatch) {
      contactParts.push(`${contactMatch[1].toUpperCase()}: ${contactMatch[2].trim()}`);
      contactMatch = contactRegex.exec(text);
    }
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
    if (emailMatch && emailMatch.length > 0) {
      contactParts.push(`EMAIL: ${emailMatch[0]}`);
    }

    return {
      supplierName,
      supplierAddress: addresses.length > 0 ? addresses.join(' | ') : null,
      supplierContact: contactParts.length > 0 ? contactParts.join(' | ') : null,
    };
  },

  isLikelyAddress(value: string): boolean {
    const compact = value.replace(/\s+/g, ' ').trim();
    if (!compact) return false;
    if (/invoice|facture|date|n°|invoice no/i.test(compact)) return false;
    return /\d+/.test(compact) && /(ave|avenue|rd|road|st|street|blvd|drive|dr|lane|ln|way|court|ct)/i.test(compact);
  },

  extractTotalsFromText(text: string): { salesTotal: number | null; taxTotal: number | null; total: number | null } {
    const cadMatches = [...text.matchAll(/CAD\s*([\d,]+\.\d{2})/gi)]
      .map((m) => this.parseMoney(m[1]))
      .filter((n): n is number => n !== null);

    let salesTotal: number | null = null;
    let taxTotal: number | null = null;
    let total: number | null = null;

    if (cadMatches.length >= 3) {
      const tail = cadMatches.slice(-3);
      const sorted = [...tail].sort((a, b) => a - b);
      taxTotal = sorted[0];
      salesTotal = sorted[1];
      total = sorted[2];
    }

    if (taxTotal === null) {
      const hstMatch = text.match(/HST[^\n]*?([\d,]+\.\d{2})/i);
      taxTotal = this.parseMoney(hstMatch?.[1]);
    }

    if (salesTotal !== null && taxTotal !== null && total === null) {
      total = Number((salesTotal + taxTotal).toFixed(2));
    }

    return { salesTotal, taxTotal, total };
  },

  extractItemHintsFromText(text: string): Array<{
    productNameEn: string;
    productNameZh: string | null;
    productCode: string | null;
    productNumber: string | null;
    un: string | null;
    taxCode: 'E' | 'H' | null;
  }> {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const hints: Array<{
      productNameEn: string;
      productNameZh: string | null;
      productCode: string | null;
      productNumber: string | null;
      un: string | null;
      taxCode: 'E' | 'H' | null;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const barcodeMatch = line.match(/\((\d{8,16})\)\s*$/);
      if (!barcodeMatch || !/[A-Za-z]/.test(line)) {
        continue;
      }

      const productNameEn = line.replace(/\(\d{8,16}\)\s*$/, '').replace(/\s+/g, ' ').trim();
      if (!productNameEn || /invoice|descriptionqtypriceamount/i.test(productNameEn)) {
        continue;
      }

      const productNumber = barcodeMatch[1] || null;
      const productNameZh = i > 0 && /[\u3400-\u9fff]/.test(lines[i - 1]) ? lines[i - 1] : null;

      let quantityLineTail = '';
      let quantityLineIndex = -1;
      for (let j = i + 1; j <= i + 5 && j < lines.length; j++) {
        const compact = lines[j].replace(/\s+/g, ' ');
        const qtyMatch = compact.match(/^(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(.*)$/);
        if (qtyMatch) {
          quantityLineTail = (qtyMatch[4] || '').trim();
          quantityLineIndex = j;
          break;
        }
      }

      let productCode: string | null = null;
      let un: string | null = null;
      let taxCode: 'E' | 'H' | null = null;

      if (quantityLineTail) {
        const tokens = quantityLineTail.split(/\s+/).filter(Boolean);
        if (tokens.length > 0) {
          if (tokens.length === 1) {
            const compact = tokens[0].toUpperCase();
            const compactMatch = compact.match(/^([A-Z0-9]{4,}?)([A-Z]{2,4})([EH])?$/);
            if (compactMatch) {
              productCode = compactMatch[1];
              un = compactMatch[2];
              taxCode = this.normalizeTaxCode(compactMatch[3]);
            } else {
              productCode = compact;
            }
          } else {
            productCode = tokens[0].toUpperCase();
            const maybeUn = tokens.find((token) => /^[A-Z]{2,4}$/.test(token.toUpperCase()));
            if (maybeUn) {
              un = maybeUn.toUpperCase();
            }
            const maybeTax = tokens.map((token) => this.normalizeTaxCode(token)).find((x) => !!x) || null;
            taxCode = maybeTax;
          }
        }
      }

      if (quantityLineIndex >= 0) {
        for (let j = quantityLineIndex + 1; j <= quantityLineIndex + 3 && j < lines.length; j++) {
          const token = lines[j].trim().toUpperCase();
          if (!un && /^[A-Z]{2,4}$/.test(token) && token !== 'CAD') {
            un = token;
            continue;
          }
          if (!taxCode) {
            taxCode = this.normalizeTaxCode(token);
          }
        }
      }

      hints.push({
        productNameEn,
        productNameZh,
        productCode,
        productNumber,
        un,
        taxCode,
      });
    }

    return hints;
  },

  normalizeNameForMatch(value: string | null | undefined): string {
    if (!value) return '';
    return value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  },

  findItemHintIndex(
    item: OcrRecognizedItem,
    hints: Array<{
      productNameEn: string;
      productNameZh: string | null;
      productCode: string | null;
      productNumber: string | null;
      un: string | null;
      taxCode: 'E' | 'H' | null;
    }>,
    usedHints: Set<number>
  ): number {
    if (item.productNumber) {
      const byNumber = hints.findIndex(
        (hint, idx) => !usedHints.has(idx) && hint.productNumber && hint.productNumber === item.productNumber
      );
      if (byNumber >= 0) return byNumber;
    }

    const itemEn = this.normalizeNameForMatch(item.productNameEn);
    if (itemEn) {
      const byEn = hints.findIndex((hint, idx) => {
        if (usedHints.has(idx)) return false;
        const hintEn = this.normalizeNameForMatch(hint.productNameEn);
        return hintEn === itemEn || hintEn.includes(itemEn) || itemEn.includes(hintEn);
      });
      if (byEn >= 0) return byEn;
    }

    const itemZh = this.normalizeNameForMatch(item.productNameZh);
    if (itemZh) {
      const byZh = hints.findIndex((hint, idx) => {
        if (usedHints.has(idx)) return false;
        const hintZh = this.normalizeNameForMatch(hint.productNameZh);
        return hintZh === itemZh || hintZh.includes(itemZh) || itemZh.includes(hintZh);
      });
      if (byZh >= 0) return byZh;
    }

    return -1;
  },

  async matchProducts(
    items: OcrRecognizedItem[],
    supplierId: number | null = null
  ): Promise<OcrRecognizedItem[]> {
    const results: OcrRecognizedItem[] = [];

    for (const item of items) {
      const keyword = item.productNameEn || item.productNameZh || '';

      // ① 已学习的供应商别名映射（条码 > 货号 > 名称，命中次数高者优先）——最高置信度
      const learned = await aliasService.lookup(supplierId, {
        productNumber: item.productNumber,
        productCode: item.productCode,
        productNameEn: item.productNameEn,
        productNameZh: item.productNameZh,
      });
      if (learned) {
        const product = await ProductModel.findById(learned.productId);
        if (product) {
          results.push({
            ...item,
            matchedProduct: {
              id: product.id,
              nameEn: product.name_en,
              nameZh: product.name_zh,
              confidence: 0.99,
            },
          });
          continue;
        }
      }

      // ② 条码精确命中（首次出现、尚未学习的条码）
      if (item.productNumber) {
        const byBarcode = await ProductModel.findByBarcode(item.productNumber).catch(() => undefined);
        if (byBarcode) {
          results.push({
            ...item,
            matchedProduct: {
              id: byBarcode.id,
              nameEn: byBarcode.name_en,
              nameZh: byBarcode.name_zh,
              confidence: 0.95,
            },
          });
          continue;
        }
      }

      if (!keyword) {
        results.push(item);
        continue;
      }

      // ③ 名称模糊匹配兜底
      const candidates = await ProductModel.search(keyword, 5);
      if (candidates.length === 0) {
        results.push(item);
        continue;
      }

      const best = this.findBestMatch(keyword, candidates);
      results.push({
        ...item,
        matchedProduct: best,
      });
    }

    return results;
  },

  findBestMatch(
    keyword: string,
    candidates: any[]
  ): { id: number; nameEn: string; nameZh: string | null; confidence: number } | null {
    const keyLower = keyword.toLowerCase().trim();

    let bestScore = 0;
    let bestCandidate: any = null;

    for (const c of candidates) {
      const nameEn = (c.name_en || '').toLowerCase();
      const nameZh = c.name_zh || '';

      let score = 0;

      // 完全匹配
      if (nameEn === keyLower || nameZh === keyword) {
        score = 1.0;
      }
      // 包含匹配
      else if (nameEn.includes(keyLower) || keyLower.includes(nameEn)) {
        score = 0.8;
      }
      // 部分匹配
      else {
        const words = keyLower.split(/\s+/);
        const matchedWords = words.filter((w) => nameEn.includes(w));
        score = matchedWords.length / words.length * 0.7;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = c;
      }
    }

    if (bestScore >= 0.3 && bestCandidate) {
      return {
        id: bestCandidate.id,
        nameEn: bestCandidate.name_en,
        nameZh: bestCandidate.name_zh,
        confidence: Math.round(bestScore * 100) / 100,
      };
    }

    return null;
  },
};
