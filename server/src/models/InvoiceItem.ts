import db from '../config/database';
import { InvoiceItemRow } from '../types';

const TABLE = 'invoice_items';

export const InvoiceItemModel = {
  async findByInvoiceId(invoiceId: number): Promise<any[]> {
    return db(TABLE)
      .select(
        'invoice_items.*',
        'products.name_en as product_name_en',
        'products.name_zh as product_name_zh',
        'products.sku as product_sku'
      )
      .leftJoin('products', 'invoice_items.product_id', 'products.id')
      .where('invoice_items.invoice_id', invoiceId)
      .orderBy('invoice_items.id', 'asc');
  },

  async create(data: Partial<InvoiceItemRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async createMany(items: Partial<InvoiceItemRow>[]): Promise<void> {
    if (items.length === 0) return;
    await db(TABLE).insert(items);
  },

  async update(id: number, data: Partial<InvoiceItemRow>): Promise<number> {
    return db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() });
  },

  async deleteByInvoiceId(invoiceId: number): Promise<number> {
    return db(TABLE).where('invoice_id', invoiceId).delete();
  },

  async getPriceHistory(productId: number, filters?: {
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Promise<any[]> {
    const query = db(TABLE)
      .select(
        'invoice_items.unit_price',
        'invoice_items.quantity',
        'invoices.invoice_date as date',
        'invoices.invoice_number',
        'suppliers.name as supplier_name'
      )
      .join('invoices', 'invoice_items.invoice_id', 'invoices.id')
      .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
      .where('invoice_items.product_id', productId)
      .where('invoices.status', 'confirmed');

    if (filters?.dateFrom) query.where('invoices.invoice_date', '>=', filters.dateFrom);
    if (filters?.dateTo) query.where('invoices.invoice_date', '<=', filters.dateTo);

    return query
      .orderBy('invoices.invoice_date', 'desc')
      .limit(filters?.limit || 50);
  },
};
