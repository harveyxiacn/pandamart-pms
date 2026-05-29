import * as XLSX from 'xlsx';
import { OcrRecognizedResult, OcrRecognizedItem } from '../types';
import logger from '../utils/logger';

export const excelService = {
  parseInvoice(filePath: string): OcrRecognizedResult {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
      throw new Error('Excel 文件内容为空或格式不正确');
    }

    // 尝试从前几行提取发票头信息
    const headerInfo = this.extractHeaderInfo(rows);

    // 找到数据表头行
    const { headerRowIndex, columnMap } = this.findDataHeader(rows);

    // 解析数据行
    const items: OcrRecognizedItem[] = [];
    let grandTotal = 0;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const item = this.parseDataRow(row, columnMap);
      if (item && item.quantity > 0) {
        items.push(item);
        grandTotal += item.lineTotal;
      }
    }

    return {
      supplierName: headerInfo.supplierName,
      supplierCode: headerInfo.supplierCode,
      supplierAddress: null,
      supplierContact: null,
      invoiceNumber: headerInfo.invoiceNumber || `EXCEL-${Date.now()}`,
      invoiceDate: headerInfo.invoiceDate || new Date().toISOString().split('T')[0],
      customerCode: headerInfo.customerCode,
      items,
      salesTotal: grandTotal,
      taxTotal: 0,
      total: grandTotal,
      subtotal: grandTotal,
      hasTax: false,
      taxAmount: 0,
      grandTotal,
    };
  },

  extractHeaderInfo(rows: any[][]): {
    supplierName: string | null;
    supplierCode: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    customerCode: string | null;
  } {
    const result: any = {
      supplierName: null,
      supplierCode: null,
      invoiceNumber: null,
      invoiceDate: null,
      customerCode: null,
    };

    // 搜索前10行中的关键信息
    const searchRows = rows.slice(0, Math.min(10, rows.length));
    for (const row of searchRows) {
      const rowStr = row.join(' ').toLowerCase();

      // 发票号
      const invMatch = rowStr.match(/inv(?:oice)?[#:\s]*([A-Z0-9-]+)/i);
      if (invMatch) result.invoiceNumber = invMatch[1];

      // 日期
      const dateMatch = rowStr.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
      if (dateMatch) {
        try {
          const d = new Date(dateMatch[1]);
          if (!isNaN(d.getTime())) {
            result.invoiceDate = d.toISOString().split('T')[0];
          }
        } catch {
          // 忽略
        }
      }

      // 客户号
      const custMatch = rowStr.match(/cust(?:omer)?[#:\s]*([A-Z0-9-]+)/i);
      if (custMatch) result.customerCode = custMatch[1];
    }

    // 供应商名通常在第一行
    if (rows[0] && rows[0][0] && typeof rows[0][0] === 'string') {
      result.supplierName = rows[0][0].trim();
    }

    return result;
  },

  findDataHeader(rows: any[][]): { headerRowIndex: number; columnMap: Record<string, number> } {
    const keywords: Record<string, string[]> = {
      description: ['description', 'item', 'product', 'name', '品名', '描述', '商品'],
      quantity: ['qty', 'quantity', 'qnty', '数量'],
      unit: ['unit', 'uom', '单位'],
      unitPrice: ['price', 'unit price', 'rate', '单价'],
      lineTotal: ['total', 'amount', 'ext', 'extended', '金额', '小计'],
    };

    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const row = rows[i];
      if (!row || row.length < 3) continue;

      const rowLower = row.map((cell: any) => String(cell || '').toLowerCase().trim());
      const columnMap: Record<string, number> = {};
      let matchCount = 0;

      for (const [field, terms] of Object.entries(keywords)) {
        for (let j = 0; j < rowLower.length; j++) {
          if (terms.some((t) => rowLower[j].includes(t))) {
            columnMap[field] = j;
            matchCount++;
            break;
          }
        }
      }

      if (matchCount >= 2) {
        return { headerRowIndex: i, columnMap };
      }
    }

    // 回退：假设列顺序为 描述, 数量, 单位, 单价, 金额
    return {
      headerRowIndex: 0,
      columnMap: {
        description: 0,
        quantity: 1,
        unit: 2,
        unitPrice: 3,
        lineTotal: 4,
      },
    };
  },

  parseDataRow(row: any[], columnMap: Record<string, number>): OcrRecognizedItem | null {
    try {
      const description = String(row[columnMap.description] || '').trim();
      if (!description) return null;

      const quantity = parseFloat(String(row[columnMap.quantity] || '0'));
      const unitPrice = parseFloat(String(row[columnMap.unitPrice] || '0'));
      const lineTotal = columnMap.lineTotal !== undefined
        ? parseFloat(String(row[columnMap.lineTotal] || '0'))
        : quantity * unitPrice;
      const unit = columnMap.unit !== undefined
        ? String(row[columnMap.unit] || 'Case').trim()
        : 'Case';

      if (isNaN(quantity) || quantity <= 0) return null;

      return {
        productNameEn: description,
        productNameZh: null,
        productCode: null,
        productNumber: null,
        un: unit || null,
        taxCode: null,
        quantity,
        unit,
        unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
        lineTotal: isNaN(lineTotal) ? quantity * unitPrice : lineTotal,
      };
    } catch {
      return null;
    }
  },
};
