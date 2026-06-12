import db from '../config/database';
import { InvoiceItemRow } from '../types';
import { parseBoundedInt } from '../utils/helpers';

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
    return db(TABLE)
      .where({ id })
      .update({ ...data, updated_at: db.fn.now() });
  },

  async deleteByInvoiceId(invoiceId: number): Promise<number> {
    return db(TABLE).where('invoice_id', invoiceId).delete();
  },

  async getPriceHistory(
    productId: number,
    filters?: {
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      months?: number;
      supplierId?: number;
      groupBy?: 'invoice' | 'month';
    }
  ): Promise<any[]> {
    const limit = parseBoundedInt(filters?.limit, {
      defaultValue: filters?.groupBy === 'month' ? 36 : 50,
      min: 1,
      max: 100,
    });
    const months = filters?.months
      ? parseBoundedInt(filters.months, { defaultValue: 6, min: 1, max: 36 })
      : undefined;

    // months 是 dateFrom 的便捷写法（最近 N 个月）；显式 dateFrom 优先
    let dateFrom = filters?.dateFrom;
    if (!dateFrom && months) {
      const d = new Date();
      d.setMonth(d.getMonth() - months);
      dateFrom = d.toISOString().slice(0, 10);
    }

    // 按月聚合：每月均价（供长期趋势视图，弱化单张发票噪声）
    if (filters?.groupBy === 'month') {
      const query = db(TABLE)
        .select(
          db.raw("DATE_FORMAT(invoices.invoice_date, '%Y-%m-01') as date"),
          db.raw('AVG(invoice_items.unit_price) as unit_price'),
          db.raw('SUM(invoice_items.quantity) as quantity')
        )
        .join('invoices', 'invoice_items.invoice_id', 'invoices.id')
        .where('invoice_items.product_id', productId)
        .where('invoices.status', 'confirmed')
        .groupByRaw("DATE_FORMAT(invoices.invoice_date, '%Y-%m-01')")
        .orderByRaw('date ASC');

      if (dateFrom) query.where('invoices.invoice_date', '>=', dateFrom);
      if (filters?.dateTo) query.where('invoices.invoice_date', '<=', filters.dateTo);
      if (filters?.supplierId) query.where('invoices.supplier_id', filters.supplierId);

      const rows = await query.limit(limit);
      return rows.map((r: any) => ({
        date: r.date,
        unit_price: r.unit_price,
        quantity: r.quantity,
        supplier_name: null,
        invoice_number: null,
      }));
    }

    // 按发票（逐笔）：取最近 N 笔后转为时间正序，便于折线图按时间绘制
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

    if (dateFrom) query.where('invoices.invoice_date', '>=', dateFrom);
    if (filters?.dateTo) query.where('invoices.invoice_date', '<=', filters.dateTo);
    if (filters?.supplierId) query.where('invoices.supplier_id', filters.supplierId);

    const rows = await query.orderBy('invoices.invoice_date', 'desc').limit(limit);
    return rows.reverse();
  },
};
