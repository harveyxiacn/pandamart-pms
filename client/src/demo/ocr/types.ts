// 本地发票 OCR 插件的内部数据模型。
// 引擎只负责「看到什么字、在哪里」，解析发票语义的逻辑全部放在 invoice-parser.ts，
// 这样解析器可以脱离 Tesseract 单测，也方便以后替换引擎（如 PaddleOCR）。


export interface OcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
}

export interface OcrLine {
  text: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  confidence: number;
  words: OcrWord[];
}

export interface OcrPage {
  pageNumber: number;
  width: number;
  height: number;
  confidence: number;
  lines: OcrLine[];
  text: string;
}

export interface OcrDocument {
  pages: OcrPage[];
  text: string;
  confidence: number;
}

export interface KnownSupplier {
  id?: number;
  name: string;
  code?: string | null;
}

export interface InvoiceParseDiagnostics {
  source: 'text' | 'ocr';
  itemCount: number;
  itemTotal: number;
  supplierMatched: boolean;
  invoiceNumberFound: boolean;
  totalsFound: boolean;
  totalsReconciled: boolean;
  warnings: string[];
}

export interface InvoiceParseResult {
  recognized: OcrRecognizedResult;
  /** 0~1，综合字段完整度、金额勾稽和 OCR 置信度 */
  confidence: number;
  diagnostics: InvoiceParseDiagnostics;
}

export interface LocalOcrStatus {
  available: boolean;
  engine: 'tesseract';
  binary: string;
  version: string | null;
  languages: string[];
  requestedLanguages: string;
  pdfRenderer: {
    available: boolean;
    binary: string;
  };
  message: string;
  installHint: string;
}

// 与服务端 server/src/types/index.ts 中的 OCR 结果结构保持一致。
export interface OcrRecognizedItem {
  productNameEn: string | null;
  productNameZh: string | null;
  productCode: string | null;
  productNumber: string | null;
  un: string | null;
  taxCode: 'E' | 'H' | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  matchedProduct?: {
    id: number;
    nameEn: string;
    nameZh: string | null;
    confidence: number;
  } | null;
}

export interface OcrRecognizedResult {
  supplierName: string | null;
  supplierCode: string | null;
  supplierAddress: string | null;
  supplierContact: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  customerCode: string | null;
  items: OcrRecognizedItem[];
  salesTotal: number | null;
  taxTotal: number | null;
  total: number;
  subtotal: number | null;
  hasTax: boolean;
  taxAmount: number | null;
  grandTotal: number;
}
