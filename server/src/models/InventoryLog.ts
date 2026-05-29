import db from '../config/database';
import { InventoryLogRow } from '../types';

const TABLE = 'inventory_logs';

export const InventoryLogModel = {
  async create(data: Partial<InventoryLogRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async findByProductId(productId: number, filters?: {
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: any[]; total: number }> {
    const query = db(TABLE)
      .select(
        'inventory_logs.*',
        'users.display_name as operated_by_name',
        'invoices.invoice_number'
      )
      .leftJoin('users', 'inventory_logs.operated_by', 'users.id')
      .leftJoin('invoices', 'inventory_logs.invoice_id', 'invoices.id')
      .where('inventory_logs.product_id', productId);

    if (filters?.type) query.where('inventory_logs.type', filters.type);
    if (filters?.dateFrom) query.where('inventory_logs.created_at', '>=', filters.dateFrom);
    if (filters?.dateTo) query.where('inventory_logs.created_at', '<=', `${filters.dateTo} 23:59:59`);

    const countQuery = db(TABLE).where('product_id', productId);
    if (filters?.type) countQuery.where('type', filters.type);
    if (filters?.dateFrom) countQuery.where('created_at', '>=', filters.dateFrom);
    if (filters?.dateTo) countQuery.where('created_at', '<=', `${filters.dateTo} 23:59:59`);

    const countResult = await countQuery.count('id as total').first();
    const total = Number(countResult?.total || 0);

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;

    const items = await query
      .orderBy('inventory_logs.created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total };
  },
};
