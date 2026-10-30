import type { OcrRecognizedItem, OcrRecognizedResult } from '../types';
import { documentFromText, joinOcrWords, mergeVisualLines } from './document';
import type {
  InvoiceParseDiagnostics,
  InvoiceParseResult,
  KnownSupplier,
  OcrDocument,
  OcrLine,
  OcrPage,
  OcrWord,
} from './types';

type ColumnKey =
  | 'description'
  | 'code'
  | 'number'
  | 'un'
  | 'unit'
  | 'qty'
  | 'unitPrice'
  | 'lineTotal'
  | 'tax';

interface Column {
  key: ColumnKey;
  anchor: number;
  start: number;
  end: number;
}

interface ParseOptions {
  knownSuppliers?: KnownSupplier[];
  source?: 'text' | 'ocr';
}

const COLUMN_PATTERNS: Array<{ key: ColumnKey; patterns: RegExp[] }> = [
  { key: 'description', patterns: [/^desc/i, /^description$/i, /^item$/i, /^product$/i, /品名/, /商品/, /货品/, /描述/, /名称/] },
  { key: 'code', patterns: [/^code$/i, /^item\s*no/i, /^item#?$/i, /^sku$/i, /货号/, /编号/] },
  { key: 'number', patterns: [/^number$/i, /^barcode$/i, /^upc$/i, /^ean$/i, /条码/] },
  { key: 'un', patterns: [/^un$/i, /^u\/m$/i, /^um$/i, /^unit\s*mark/i] },
  { key: 'unit', patterns: [/^unit$/i, /^uom$/i, /^units$/i, /单位/] },
  { key: 'qty', patterns: [/^qty$/i, /^quantity$/i, /^qnty$/i, /^q'ty$/i, /数量/] },
  { key: 'unitPrice', patterns: [/^price$/i, /^unit\s*price$/i, /^rate$/i, /^unit\s*cost$/i, /单价/] },
  { key: 'lineTotal', patterns: [/^amount$/i, /^total$/i, /^ext(?:ended)?$/i, /^line\s*total$/i, /金额/, /小计/] },
  { key: 'tax', patterns: [/^tax$/i, /^hst$/i, /^gst$/i, /^pst$/i, /^qst$/i, /税/] },
];

const TOTAL_LINE = /^(sub\s*total|sales\s*total|merchandise\s*total|hst|gst|pst|qst|tva|tax\b|grand\s*total|total\b|balance\s*due|amount\s*due|小计|合计|税额|总计|应付)/i;
const HEADER_NOISE = /(invoice|date|page|ship|bill|order|customer|account|terms|description|qty|quantity|price|amount|total)/i;
const MONEY = /\(?-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?/g;

function normalizeHeaderWord(word: string): string {
  return word.trim().toLowerCase().replace(/[:：]+$/, '');
}

function headerColumnFor(word: string): ColumnKey | null {
  const normalized = normalizeHeaderWord(word);
  if (!normalized) return null;
  for (const { key, patterns } of COLUMN_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(normalized))) return key;
  }
  return null;
}

function findHeader(line: OcrLine): { columns: Column[]; score: number } | null {
  if (line.words.length < 3 || line.words.length > 30) return null;

  const anchors = new Map<ColumnKey, number>();
  for (const word of line.words) {
    if (!word.text || word.text.length > 30) continue;
    const key = headerColumnFor(word.text);
    if (!key) continue;
    const center = word.left + word.width / 2;
    if (!anchors.has(key)) anchors.set(key, center);
  }

  const hasDescription = anchors.has('description');
  const hasQty = anchors.has('qty');
  const hasAmount = anchors.has('unitPrice') || anchors.has('lineTotal');
  if (!hasDescription || !hasQty || !hasAmount) return null;

  const sorted = [...anchors.entries()].sort((a, b) => a[1] - b[1]);
  const columns: Column[] = sorted.map(([key, anchor], index) => {
    const prev = index > 0 ? (sorted[index - 1][1] + anchor) / 2 : Number.NEGATIVE_INFINITY;
    const next =
      index < sorted.length - 1 ? (anchor + sorted[index + 1][1]) / 2 : Number.POSITIVE_INFINITY;
    return { key, anchor, start: prev, end: next };
  });

  const score = anchors.size + (hasDescription ? 1 : 0) + (hasQty ? 1 : 0) + (hasAmount ? 1 : 0);
  return { columns, score };
}

function assignWord(word: OcrWord, columns: Column[]): Column | null {
  let best: Column | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    // 描述列左对齐，用左边界；数字列通常右对齐，用中心点更稳。
    const position = column.key === 'description' ? word.left : word.left + word.width / 2;
    const distance =
      position >= column.start && position < column.end
        ? 0
        : Math.min(Math.abs(position - column.start), Math.abs(position - column.end));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = column;
    }
  }
  return best;
}

function parseNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value)
    .replace(/[^\d.,()-]/g, '')
    .replace(/,/g, '');
  if (!cleaned) return null;
  const negative = cleaned.startsWith('(') && cleaned.endsWith(')');
  const parsed = Number(cleaned.replace(/[()]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function parseMoney(value: string): number | null {
  const matches = value.match(MONEY);
  if (!matches || matches.length === 0) return null;
  return parseNumber(matches[matches.length - 1]);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeTaxCode(value: string | null | undefined): 'E' | 'H' | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (/^E$/.test(upper) || /[^A-Z]E$/.test(upper)) return 'E';
  if (/^H$/.test(upper) || /[^A-Z]H$/.test(upper)) return 'H';
  return null;
}

function splitProductNames(description: string): { nameEn: string; nameZh: string | null; barcode: string | null } {
  let text = description.replace(/\s+/g, ' ').trim();
  let barcode: string | null = null;
  const barcodeMatch = text.match(/\((\d{8,16})\)\s*$/);
  if (barcodeMatch) {
    barcode = barcodeMatch[1];
    text = text.slice(0, barcodeMatch.index).trim();
  }

  // 「椰子水 24罐」「COKE 24 CANS」：包装规格不是商品名，避免污染名称匹配
  text = text.replace(/\s*\d+\s*(罐|箱|包|袋|瓶|盒|个|件|磅|斤|公斤|千克)\s*$/u, '').trim();

  if (/[㐀-鿿]/.test(text)) {
    const zhParts = text.match(/[㐀-鿿][㐀-鿿\s·\-（）()]*/g) || [];
    const nameZh =
      zhParts
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/([㐀-鿿])\s+(?=[㐀-鿿])/g, '$1')
        .trim() || null;
    let nameEn = text
      .replace(/[㐀-鿿][㐀-鿿\s·\-（）()]*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // 「椰子水 2468」里的 2468 多半是 OCR 看错的包装规格，不应作为英文名
    if (/^[\d\s.,()/-]+$/.test(nameEn)) nameEn = '';
    return { nameEn, nameZh, barcode };
  }

  return { nameEn: text, nameZh: null, barcode };
}

function stripLeadingCode(name: string, code: string | null): string {
  if (!code) return name;
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`^${escaped}\\s*[-–—:]?\\s*`, 'i'), '').trim();
}

function textLooksLikeItem(text: string): boolean {
  if (!text || text.length < 2) return false;
  if (TOTAL_LINE.test(text)) return false;
  if (/^(description|item|product|qty|quantity|price|amount|total|code|unit)\b/i.test(text)) return false;
  return /[A-Za-z㐀-鿿]/.test(text);
}

function getPageLines(page: OcrPage): OcrLine[] {
  return mergeVisualLines(page.lines);
}

function collectKnownSupplier(text: string, known: KnownSupplier[]): string | null {
  if (known.length === 0) return null;
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9㐀-鿿]+/g, '');
  if (!normalizedText) return null;

  let best: KnownSupplier | null = null;
  let bestLength = 0;
  for (const supplier of known) {
    const name = (supplier.name || '').trim();
    if (!name) continue;
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9㐀-鿿]+/g, '');
    if (normalizedName.length >= 3 && normalizedText.includes(normalizedName) && normalizedName.length > bestLength) {
      best = supplier;
      bestLength = normalizedName.length;
    }
  }
  return best?.name || null;
}

function detectSupplier(text: string, lines: OcrLine[], known: KnownSupplier[]): string | null {
  const knownMatch = collectKnownSupplier(lines.slice(0, 30).map((line) => line.text).join('\n'), known);
  if (knownMatch) return knownMatch;

  const headerLines = lines.slice(0, 12).map((line) => line.text.trim()).filter(Boolean);
  const companyLine = headerLines.find(
    (line) =>
      /(inc|incorporated|ltd|limited|corp|corporation|wholesale|foods?|trading|company|co\.|llc|distribution|supply)/i.test(
        line
      ) && !HEADER_NOISE.test(line) && line.length <= 120
  );
  if (companyLine) return companyLine;

  const firstLine = headerLines.find(
    (line) => line.length >= 2 && line.length <= 100 && !HEADER_NOISE.test(line) && /[A-Za-z㐀-鿿]/.test(line)
  );
  return firstLine || null;
}

function detectInvoiceNumber(text: string): string | null {
  const candidates = [
    /invoice\s*(?:no\.?|number|n[o°]|#)\s*[:#：-]?\s*([A-Z0-9][A-Z0-9\-/]{2,})/i,
    /inv(?:oice)?\s*[:#：]\s*([A-Z0-9][A-Z0-9\-/]{2,})/i,
    /发票号码\s*[:：]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i,
    /单据编号\s*[:：]?\s*([A-Z0-9\-/]{4,})/i,
  ];

  for (const pattern of candidates) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (!value) continue;
    if (/^(no|number|date|invoice|number)$/i.test(value)) continue;
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value)) continue;
    return value;
  }
  return null;
}

function normalizeDateParts(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function detectInvoiceDate(text: string, lines: OcrLine[]): string | null {
  const dateLine =
    lines.find((line) => /\b(date|dated|invoice\s*date|日期|开票日期)\b/i.test(line.text))?.text ||
    lines.slice(0, 25).map((line) => line.text).join('\n');

  const iso = dateLine.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    const result = normalizeDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (result) return result;
  }

  const us = dateLine.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (us) {
    let year = Number(us[3]);
    if (year < 100) year += 2000;
    const first = Number(us[1]);
    const second = Number(us[2]);
    // 加拿大供应商多为 MM/DD/YYYY；只有第一位 > 12 时才按 DD/MM 解释。
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    const result = normalizeDateParts(year, month, day);
    if (result) return result;
  }

  const monthNames = dateLine.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})/i
  );
  if (monthNames) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.indexOf(monthNames[1].toLowerCase().slice(0, 3)) + 1;
    const result = normalizeDateParts(Number(monthNames[3]), month, Number(monthNames[2]));
    if (result) return result;
  }

  return null;
}

function extractAddressAndContact(text: string): { address: string | null; contact: string | null } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const addresses: string[] = [];

  for (let i = 0; i < lines.length && addresses.length < 2; i++) {
    const line = lines[i];
    if (!/\d+/.test(line)) continue;
    if (!/(ave|avenue|rd|road|st|street|blvd|drive|dr|lane|ln|way|court|ct|unit|suite|highway|hwy)/i.test(line)) continue;
    let combined = line;
    const next = lines[i + 1] || '';
    if (next && /[A-Za-z].*,\s*[A-Z]{2}\s*[A-Z0-9]{3,}/.test(next)) combined = `${line}, ${next}`;
    if (!addresses.includes(combined)) addresses.push(combined);
  }

  const contacts: string[] = [];
  const contactRegex = /(FAX|TEL|PHONE|MOBILE|电话|传真)\s*[:：]?\s*([+()\-\d\s]{6,})/gi;
  let contactMatch: RegExpExecArray | null;
  while ((contactMatch = contactRegex.exec(text))) {
    contacts.push(`${contactMatch[1].toUpperCase()}: ${contactMatch[2].trim()}`);
  }
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) contacts.push(`EMAIL: ${email[0]}`);

  return {
    address: addresses.length > 0 ? addresses.join(' | ') : null,
    contact: contacts.length > 0 ? contacts.join(' | ') : null,
  };
}

function extractTotals(lines: OcrLine[]): { salesTotal: number | null; taxTotal: number | null; total: number | null } {
  let salesTotal: number | null = null;
  let taxTotal: number | null = null;
  let total: number | null = null;

  const candidates = lines.slice(-25).reverse();
  for (const line of candidates) {
    const text = line.text.trim();
    if (!text) continue;
    const amount = parseMoney(text);
    if (amount === null) continue;

    if (taxTotal === null && /(hst|gst|pst|qst|tva|\btax\b|税额)/i.test(text)) {
      taxTotal = amount;
      continue;
    }
    if (salesTotal === null && /(sub\s*total|sales\s*total|merchandise|小计|税前|货款)/i.test(text)) {
      salesTotal = amount;
      continue;
    }
    if (total === null && /(grand\s*total|balance\s*due|amount\s*due|总计|合计|应付|^total\b)/i.test(text)) {
      total = amount;
    }
  }

  // 不做「取最后三个金额」的猜测：表格明细行本身也含金额，猜错会把明细总额
  // 当成发票总额。未识别到标签时由调用方用明细合计兜底。

  if (salesTotal === null && total !== null && taxTotal !== null) salesTotal = roundMoney(total - taxTotal);
  if (total === null && salesTotal !== null) total = roundMoney(salesTotal + (taxTotal || 0));

  return { salesTotal, taxTotal, total };
}

function buildItem(values: {
  description: string;
  code: string | null;
  number: string | null;
  un: string | null;
  unit: string | null;
  taxCode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}): OcrRecognizedItem | null {
  let description = values.description.replace(/\s+/g, ' ').trim();
  if (!textLooksLikeItem(description)) return null;

  // 列识别失败时描述可能吞掉了行尾数字，去掉它们
  description = description.replace(/\s+\d+(?:\.\d+)?\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}(?:\s+[A-Z]{1,4})?(?:\s+[EH])?$/i, '').trim();
  if (!textLooksLikeItem(description)) return null;

  const names = splitProductNames(description);
  const productCode = values.code?.trim() || null;
  const nameEn = stripLeadingCode(names.nameEn, productCode);
  const productNumber = values.number?.trim() || names.barcode;
  const unit = (values.unit || values.un || 'Case').trim();
  const un = (values.un || (/^[A-Za-z]{2,4}$/.test(unit) ? unit : null)) as string | null;
  const quantity = Number(values.quantity);
  const unitPrice = Number(values.unitPrice);
  const lineTotal = Number(values.lineTotal);

  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;
  if (!Number.isFinite(lineTotal) || lineTotal < 0) return null;

  return {
    productNameEn: nameEn || null,
    productNameZh: names.nameZh,
    productCode,
    productNumber,
    un: un ? un.toUpperCase() : null,
    taxCode: normalizeTaxCode(values.taxCode),
    quantity,
    unit,
    unitPrice: roundMoney(unitPrice),
    lineTotal: roundMoney(lineTotal),
  };
}

function parseItemFromLine(line: OcrLine, columns: Column[], fallbackDescription = ''): OcrRecognizedItem | null {
  const buckets = new Map<ColumnKey, OcrWord[]>();
  const leftovers: OcrWord[] = [];

  for (const word of line.words) {
    const column = assignWord(word, columns);
    if (!column) {
      leftovers.push(word);
      continue;
    }
    const bucket = buckets.get(column.key);
    if (bucket) bucket.push(word);
    else buckets.set(column.key, [word]);
  }

  const valueOf = (key: ColumnKey) => joinOcrWords(buckets.get(key) || []);
  const description = [valueOf('description'), joinOcrWords(leftovers)].filter(Boolean).join(' ').trim() || fallbackDescription;

  const qty = parseNumber(valueOf('qty'));
  let unitPrice = parseNumber(valueOf('unitPrice'));
  let lineTotal = parseNumber(valueOf('lineTotal'));

  // 列识别没命中时，用行尾数字兜底：数量 单价 金额（或 数量 金额）
  if (qty === null || (unitPrice === null && lineTotal === null)) {
    const numericWords = line.words.map((word) => word.text).filter((text) => /^\$?[\d,]+(?:\.\d{1,2})?$/.test(text));
    if (numericWords.length >= 3) {
      const [qtyText, priceText, totalText] = numericWords.slice(-3);
      return buildItem({
        description,
        code: valueOf('code') || null,
        number: valueOf('number') || null,
        un: valueOf('un') || null,
        unit: valueOf('unit') || null,
        taxCode: valueOf('tax') || null,
        quantity: parseNumber(qtyText) || 0,
        unitPrice: parseNumber(priceText) || 0,
        lineTotal: parseNumber(totalText) || 0,
      });
    }
    if (numericWords.length === 2) {
      const [qtyText, totalText] = numericWords;
      const parsedQty = parseNumber(qtyText) || 0;
      const parsedTotal = parseNumber(totalText) || 0;
      return buildItem({
        description,
        code: valueOf('code') || null,
        number: valueOf('number') || null,
        un: valueOf('un') || null,
        unit: valueOf('unit') || null,
        taxCode: valueOf('tax') || null,
        quantity: parsedQty,
        unitPrice: parsedQty > 0 ? roundMoney(parsedTotal / parsedQty) : 0,
        lineTotal: parsedTotal,
      });
    }
    return null;
  }

  if (lineTotal === null && unitPrice !== null) lineTotal = roundMoney(qty * unitPrice);
  if (unitPrice === null && lineTotal !== null) unitPrice = qty > 0 ? roundMoney(lineTotal / qty) : 0;

  return buildItem({
    description,
    code: valueOf('code') || null,
    number: valueOf('number') || null,
    un: valueOf('un') || null,
    unit: valueOf('unit') || null,
    taxCode: valueOf('tax') || null,
    quantity: qty,
    unitPrice: unitPrice || 0,
    lineTotal: lineTotal || 0,
  });
}

function parseWithColumns(page: OcrPage, headerIndex: number, columns: Column[]): OcrRecognizedItem[] {
  const lines = getPageLines(page);
  const items: OcrRecognizedItem[] = [];
  let pendingDescription = '';

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (!text) continue;

    if (items.length > 0 && TOTAL_LINE.test(text)) break;

    const item = parseItemFromLine(line, columns, pendingDescription);
    if (item) {
      items.push(item);
      pendingDescription = '';
      continue;
    }

    // 没有数字的行：可能是下一件商品的名称（中文名/英文名分两行）
    if (textLooksLikeItem(text) && line.words.length <= 12) {
      pendingDescription = pendingDescription ? `${pendingDescription} ${text}` : text;
    }
  }

  return items;
}

function isMoneyToken(token: string): boolean {
  return /^\(?\$?-?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?$/.test(token);
}

function isQuantityToken(token: string): boolean {
  return /^\d{1,6}(?:\.\d{1,4})?$/.test(token);
}

function isTaxToken(token: string): string | null {
  return /^[EH]$/i.test(token) ? token.toUpperCase() : null;
}

function isUnitToken(token: string): boolean {
  if (!/^[A-Za-z]{1,5}$/.test(token)) return false;
  return !/^(CAD|USD|HST|GST|PST|QST|TOTAL|SUBTOTAL|INVOICE|DATE|TAX)$/i.test(token);
}

function isCodeToken(token: string): boolean {
  // 货号通常同时含数字/大写字母；纯英文商品名不当货号
  return /^(?=.*\d)[A-Z0-9][A-Z0-9._-]{2,}$/i.test(token);
}

/**
 * 不依赖坐标的明细解析：从每行末尾的三个数字反推「数量 / 单价 / 金额」。
 * 比按表头坐标切列更耐 OCR 抖动；名称行与数字行分开时用 pendingDescription 拼接。
 */
function parsePageWithTokens(page: OcrPage, headerIndex = -1): OcrRecognizedItem[] {
  const items: OcrRecognizedItem[] = [];
  let pendingDescription = '';
  const lines = getPageLines(page);

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (!text) continue;
    if (items.length > 0 && TOTAL_LINE.test(text)) break;

    const tokens = line.words.map((word) => word.text.trim()).filter(Boolean);
    if (tokens.length === 0) continue;

    const numericIndexes = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => isMoneyToken(token) || isQuantityToken(token));

    if (numericIndexes.length >= 2) {
      const selected = numericIndexes.slice(-3);
      const first = selected[0];
      const second = selected[1];
      const third = selected[2];

      let quantity: number;
      let unitPrice: number;
      let lineTotal: number;
      if (third) {
        quantity = parseNumber(first.token) || 0;
        unitPrice = parseNumber(second.token) || 0;
        lineTotal = parseNumber(third.token) || 0;
      } else {
        quantity = parseNumber(first.token) || 0;
        lineTotal = parseNumber(second.token) || 0;
        unitPrice = quantity > 0 ? roundMoney(lineTotal / quantity) : 0;
      }

      const tailTokens = tokens.slice((third || second).index + 1);
      const taxCode = tailTokens.map(isTaxToken).find((value): value is string => Boolean(value)) || null;
      const tailUnit = tailTokens.find((token) => isUnitToken(token) && !isTaxToken(token)) || null;
      const betweenUnit = tokens
        .slice(first.index + 1, second.index)
        .find((token) => isUnitToken(token) && !isTaxToken(token)) || null;
      const unitCandidate = betweenUnit || tailUnit;

      let description = tokens
        .slice(0, first.index)
        .join(' ')
        .replace(/([㐀-鿿])\s+(?=[㐀-鿿])/g, '$1')
        .replace(/(\d)\s+(?=[㐀-鿿])/g, '$1')
        .trim();

      if (!description || !textLooksLikeItem(description)) description = pendingDescription;
      if (!description) continue;

      let productCode: string | null = null;
      const leading = description.match(/^([A-Z0-9][A-Z0-9._-]{2,})\s+(.+)$/i);
      if (leading && isCodeToken(leading[1])) {
        productCode = leading[1];
        description = leading[2];
      }

      const item = buildItem({
        description,
        code: productCode,
        number: null,
        un: unitCandidate || betweenUnit,
        unit: unitCandidate || betweenUnit,
        taxCode,
        quantity,
        unitPrice,
        lineTotal,
      });

      if (item) {
        items.push(item);
        pendingDescription = '';
        continue;
      }
    }

    if (textLooksLikeItem(text) && !/\d+\.\d{2}/.test(text)) {
      pendingDescription = pendingDescription ? `${pendingDescription} ${text}` : text;
    }
  }

  return items;
}

function parseItems(document: OcrDocument): { items: OcrRecognizedItem[]; warnings: string[] } {
  const tokenItems: OcrRecognizedItem[] = [];
  const columnItems: OcrRecognizedItem[] = [];
  const warnings: string[] = [];

  for (const page of document.pages) {
    const lines = getPageLines(page);
    let headerIndex = -1;
    let bestHeader: { columns: Column[]; score: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const header = findHeader(lines[i]);
      if (header && (!bestHeader || header.score > bestHeader.score)) {
        bestHeader = header;
        headerIndex = i;
      }
    }

    tokenItems.push(...parsePageWithTokens(page, headerIndex));
    if (bestHeader && headerIndex >= 0) {
      columnItems.push(...parseWithColumns(page, headerIndex, bestHeader.columns));
    }
  }

  // 同一批数据用两种方式解析：数量更多者优先；数量相同用行尾数字版（字段更干净）。
  let items = tokenItems;
  if (columnItems.length > tokenItems.length) {
    items = columnItems;
  } else if (tokenItems.length === 0 && columnItems.length > 0) {
    items = columnItems;
  }

  if (items.length === 0) {
    warnings.push('未识别出商品明细，请检查发票清晰度或改用 Excel 导入。');
  } else if (columnItems.length > tokenItems.length) {
    warnings.push('明细由表头列坐标解析，已按行尾数字规则交叉校验。');
  }

  return { items, warnings };
}

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function parseInvoiceDocument(document: OcrDocument, options: ParseOptions = {}): InvoiceParseResult {
  const source = options.source || 'ocr';
  const text = document.text || document.pages.map((page) => page.text).join('\n');
  const lines = document.pages.flatMap((page) => getPageLines(page));

  const supplierName = detectSupplier(text, lines, options.knownSuppliers || []);
  const invoiceNumber = detectInvoiceNumber(text);
  const invoiceDate = detectInvoiceDate(text, lines);
  const { items, warnings } = parseItems(document);
  const totals = extractTotals(lines);
  const extra = extractAddressAndContact(text);

  const itemTotal = roundMoney(items.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0));
  const salesTotal = totals.salesTotal ?? (items.length > 0 ? itemTotal : null);
  const taxTotal = totals.taxTotal ?? 0;
  const total = totals.total ?? roundMoney((salesTotal || 0) + taxTotal);

  const tolerance = Math.max(1, Math.abs(salesTotal || itemTotal) * 0.01);
  const totalsReconciled =
    items.length > 0 &&
    ((totals.salesTotal !== null && Math.abs(itemTotal - totals.salesTotal) <= tolerance) ||
      (totals.total !== null && Math.abs(itemTotal + taxTotal - totals.total) <= tolerance));

  if (items.length > 0 && totals.salesTotal !== null && !totalsReconciled) {
    warnings.push(`明细合计 ${itemTotal.toFixed(2)} 与发票小计 ${totals.salesTotal.toFixed(2)} 不一致，请核对。`);
  }
  if (supplierName && (options.knownSuppliers || []).every((supplier) => supplier.name !== supplierName)) {
    warnings.push(`供应商「${supplierName}」不在供应商库中，确认前请手动选择。`);
  }
  if (!invoiceNumber) warnings.push('未识别到发票编号，已生成临时编号。');
  if (source === 'ocr' && document.confidence > 0 && document.confidence < 60) {
    warnings.push(`OCR 平均置信度 ${document.confidence.toFixed(0)}%，建议人工核对明细。`);
  }

  const recognized: OcrRecognizedResult = {
    supplierName,
    supplierCode: null,
    supplierAddress: extra.address,
    supplierContact: extra.contact,
    invoiceNumber: invoiceNumber || `LOCAL-${Date.now()}`,
    invoiceDate: invoiceDate || todayLocal(),
    customerCode: null,
    items,
    salesTotal,
    taxTotal,
    total,
    subtotal: salesTotal,
    hasTax: taxTotal > 0 || items.some((item) => item.taxCode === 'H'),
    taxAmount: taxTotal,
    grandTotal: total,
  };

  const supplierMatched = Boolean(
    supplierName && (options.knownSuppliers || []).some((supplier) => supplier.name === supplierName)
  );
  let score = 0;
  if (items.length > 0) score += 0.35;
  if (supplierMatched) score += 0.15;
  else if (supplierName) score += 0.05;
  if (invoiceNumber) score += 0.1;
  if (invoiceDate) score += 0.05;
  if (totals.salesTotal !== null || totals.total !== null) score += 0.1;
  if (totalsReconciled) score += 0.15;
  if (document.confidence > 0) score += Math.min(0.1, (document.confidence / 100) * 0.1);

  const diagnostics: InvoiceParseDiagnostics = {
    source,
    itemCount: items.length,
    itemTotal,
    supplierMatched,
    invoiceNumberFound: Boolean(invoiceNumber),
    totalsFound: totals.salesTotal !== null || totals.total !== null,
    totalsReconciled,
    warnings,
  };

  return {
    recognized,
    confidence: Math.min(0.98, Math.round(score * 100) / 100),
    diagnostics,
  };
}

export function parseInvoiceText(text: string, options: Omit<ParseOptions, 'source'> = {}): InvoiceParseResult {
  return parseInvoiceDocument(documentFromText(text), { ...options, source: 'text' });
}
