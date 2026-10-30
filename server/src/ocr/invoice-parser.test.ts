import { describe, expect, it } from 'vitest';
import { parseInvoiceDocument, parseInvoiceText } from './invoice-parser';
import { documentFromText, parseTesseractTsv } from './document';
import type { KnownSupplier } from './types';

const SUPPLIERS: KnownSupplier[] = [
  { id: 1, name: 'CBS Wholesale', code: 'CBS-001' },
  { id: 2, name: 'Great Wall Imports', code: 'GWI-001' },
];

describe('invoice-parser 本地确定性解析', () => {
  it('解析单行明细的英文发票并完成金额勾稽', () => {
    const text = `CBS Wholesale Inc.
123 Main Street
Toronto, ON M5V 2T6
Tel: 416-555-0100
Invoice No: INV-2026-001
Invoice Date: 10/30/2026

Description Qty Unit Price Amount Tax
Ginger Root 10 LB 3.99 39.90 E
Apple Fuji 5 Case 20.00 100.00 E
Subtotal 139.90
HST 18.19
Total 158.09`;

    const result = parseInvoiceText(text, { knownSuppliers: SUPPLIERS });
    expect(result.recognized.supplierName).toBe('CBS Wholesale');
    expect(result.recognized.invoiceNumber).toBe('INV-2026-001');
    expect(result.recognized.invoiceDate).toBe('2026-10-30');
    expect(result.recognized.items).toHaveLength(2);
    expect(result.recognized.items[0]).toMatchObject({
      productNameEn: 'Ginger Root',
      quantity: 10,
      unit: 'LB',
      unitPrice: 3.99,
      lineTotal: 39.9,
    });
    expect(result.recognized.items[1]).toMatchObject({
      quantity: 5,
      unitPrice: 20,
      lineTotal: 100,
    });
    expect(result.recognized.salesTotal).toBe(139.9);
    expect(result.recognized.taxAmount).toBe(18.19);
    expect(result.recognized.grandTotal).toBe(158.09);
    expect(result.diagnostics.totalsReconciled).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('地址解析不会把 HST 里的 ST 当成 Street', () => {
    const text = `CBS Wholesale
123 Market Street
Toronto, ON M5V 2T6
HST 13% 12.74
Subtotal 98.00
Total 110.74`;

    const result = parseInvoiceText(text);
    expect(result.recognized.supplierAddress).toBe('123 Market Street, Toronto, ON M5V 2T6');
  });

  it('解析名称与数量分两行的发票，并保留条码', () => {
    const text = `CBS Wholesale
Invoice #: 778899
Date: 2026/10/29

Description Qty Price Amount
Ginger Root (12345678)
2 3.99 7.98
Apple Fuji
5 20.00 100.00
TOTAL 107.98`;

    const result = parseInvoiceText(text, { knownSuppliers: SUPPLIERS });
    expect(result.recognized.items).toHaveLength(2);
    expect(result.recognized.items[0]).toMatchObject({
      productNameEn: 'Ginger Root',
      productNumber: '12345678',
      quantity: 2,
      unitPrice: 3.99,
      lineTotal: 7.98,
    });
  });

  it('解析中文发票并区分中英文名称', () => {
    const text = `Great Wall Imports Ltd
发票号码：GW-2026-88
开票日期：2026-10-30
品名 数量 单价 金额
腐竹 2 9.99 19.98
椰子水 24罐 4 12.00 48.00
小计 67.98
税额 8.84
总计 76.82`;

    const result = parseInvoiceText(text, { knownSuppliers: SUPPLIERS });
    expect(result.recognized.supplierName).toBe('Great Wall Imports');
    expect(result.recognized.invoiceNumber).toBe('GW-2026-88');
    expect(result.recognized.items).toHaveLength(2);
    expect(result.recognized.items[0]).toMatchObject({
      productNameZh: '腐竹',
      quantity: 2,
      unitPrice: 9.99,
      lineTotal: 19.98,
    });
    expect(result.recognized.items[1].quantity).toBe(4);
    expect(result.recognized.grandTotal).toBe(76.82);
  });

  it('没有表头时仍能从行尾数字解析', () => {
    const text = `Some Supplier Ltd
Invoice 12345
Apple Fuji 5 20.00 100.00
Ginger Root 2 3.99 7.98`;
    const result = parseInvoiceText(text);
    expect(result.recognized.items).toHaveLength(2);
    expect(result.diagnostics.warnings.length).toBeGreaterThan(0);
  });
});

describe('OCR 文档构建', () => {
  it('从文本生成带坐标的文档', () => {
    const document = documentFromText('Description Qty Price Amount\nApple  5  20.00  100.00');
    expect(document.pages).toHaveLength(1);
    expect(document.pages[0].lines).toHaveLength(2);
    expect(document.pages[0].lines[1].words.map((word) => word.text)).toEqual(['Apple', '5', '20.00', '100.00']);
  });

  it('解析 Tesseract TSV 并重建行文本', () => {
    const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
    const row = (
      line: number,
      word: number,
      left: number,
      text: string,
      top = 10 + line * 30
    ) => `5\t1\t1\t1\t${line}\t${word}\t${left}\t${top}\t60\t20\t92.5\t${text}`;
    const tsv = [
      header,
      row(1, 1, 20, 'Description'),
      row(1, 2, 300, 'Qty'),
      row(1, 3, 420, 'Price'),
      row(1, 4, 540, 'Amount'),
      row(2, 1, 20, 'Apple'),
      row(2, 2, 60, 'Fuji'),
      row(2, 3, 300, '5'),
      row(2, 4, 420, '20.00'),
      row(2, 5, 540, '100.00'),
      row(3, 1, 20, 'Total'),
      row(3, 2, 540, '100.00'),
    ].join('\n');

    const document = parseTesseractTsv(tsv);
    expect(document.pages).toHaveLength(1);
    expect(document.pages[0].lines[0].text).toContain('Description');
    expect(document.pages[0].lines[1].text).toBe('Apple Fuji 5 20.00 100.00');
    expect(document.confidence).toBeCloseTo(92.5, 1);

    const result = parseInvoiceDocument(document, { source: 'ocr', knownSuppliers: SUPPLIERS });
    expect(result.recognized.items).toHaveLength(1);
    expect(result.recognized.items[0]).toMatchObject({
      productNameEn: 'Apple Fuji',
      quantity: 5,
      unitPrice: 20,
      lineTotal: 100,
    });
  });
});
