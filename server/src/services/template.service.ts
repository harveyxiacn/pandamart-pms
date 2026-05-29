import { SupplierTemplateModel } from '../models/SupplierTemplate';
import { OcrRecognizedResult } from '../types';
import logger from '../utils/logger';

export const templateService = {
  async tryMatchTemplate(
    supplierId: number,
    text: string
  ): Promise<OcrRecognizedResult | null> {
    try {
      const template = await SupplierTemplateModel.findBySupplierId(supplierId);
      if (!template) return null;

      const config = typeof template.template_config === 'string'
        ? JSON.parse(template.template_config)
        : template.template_config;

      if (template.template_type === 'regex') {
        return this.applyRegexTemplate(text, config);
      }

      return null;
    } catch (err) {
      logger.warn('模板匹配失败:', err);
      return null;
    }
  },

  applyRegexTemplate(text: string, config: any): OcrRecognizedResult | null {
    try {
      let invoiceNumber: string | null = null;
      let invoiceDate: string | null = null;
      let supplierName: string | null = null;

      if (config.invoice_number_pattern) {
        const match = text.match(new RegExp(config.invoice_number_pattern));
        if (match) invoiceNumber = match[0];
      }

      if (config.date_pattern) {
        const match = text.match(new RegExp(config.date_pattern));
        if (match) {
          invoiceDate = this.normalizeDate(match[0], config.date_format);
        }
      }

      if (config.supplier_name_pattern) {
        const match = text.match(new RegExp(config.supplier_name_pattern, 'i'));
        if (match) supplierName = match[0];
      }

      let grandTotal = 0;
      if (config.total_pattern) {
        const match = text.match(new RegExp(config.total_pattern));
        if (match && match[1]) {
          grandTotal = parseFloat(match[1].replace(/,/g, ''));
        }
      }

      // 基本头部信息可以提取，但明细项需要更复杂的解析
      // 此处返回基本信息，明细项由 LLM 补充
      if (invoiceNumber || invoiceDate) {
        return {
          supplierName,
          supplierCode: null,
          supplierAddress: null,
          supplierContact: null,
          invoiceNumber: invoiceNumber || `TPL-${Date.now()}`,
          invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
          customerCode: null,
          items: [],
          salesTotal: grandTotal,
          taxTotal: 0,
          total: grandTotal,
          subtotal: null,
          hasTax: false,
          taxAmount: 0,
          grandTotal,
        };
      }

      return null;
    } catch {
      return null;
    }
  },

  normalizeDate(dateStr: string, format?: string): string {
    try {
      if (format === 'MM/DD/YYYY') {
        const parts = dateStr.split('/');
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
      if (format === 'DD/MM/YYYY') {
        const parts = dateStr.split('/');
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  },

  async saveTemplate(
    supplierId: number,
    templateType: 'regex' | 'positional' | 'ai_prompt',
    config: any
  ): Promise<void> {
    await SupplierTemplateModel.upsert(supplierId, {
      template_type: templateType,
      template_config: JSON.stringify(config),
    });
  },
};
