import db from '../config/database';

const TABLE = 'inventory_batches';

export const InventoryBatchModel = {
  async findById(id: number): Promise<any | undefined> {
    return db(TABLE).where('id', id).first();
  },

  async list(filters: {
    productId?: number;
    status?: string;
    expiringWithinDays?: number;
    includeExpired?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: any[]; total: number }> {
    const apply = (q: any) => {
      q.whereNull('products.deleted_at');
      if (filters.productId) q.where('inventory_batches.product_id', filters.productId);
      if (filters.status) q.where('inventory_batches.status', filters.status);
      if (filters.expiringWithinDays !== undefined) {
        const cutoff = new Date(Date.now() + filters.expiringWithinDays * 86400000)
          .toISOString()
          .slice(0, 10);
        q.whereNotNull('inventory_batches.expiry_date').where('inventory_batches.expiry_date', '<=', cutoff);
        if (!filters.includeExpired) {
          const today = new Date().toISOString().slice(0, 10);
          q.where('inventory_batches.expiry_date', '>=', today);
        }
      }
      return q;
    };

    const countRow = await apply(
      db(TABLE).join('products', 'inventory_batches.product_id', 'products.id')
    )
      .count('inventory_batches.id as total')
      .first();
    const total = Number(countRow?.total || 0);

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;

    const items = await apply(
      db(TABLE)
        .join('products', 'inventory_batches.product_id', 'products.id')
        .select(
          'inventory_batches.*',
          'products.name_en as product_name_en',
          'products.name_zh as product_name_zh',
          'products.sku as product_sku'
        )
    )
      .orderByRaw('inventory_batches.expiry_date IS NULL, inventory_batches.expiry_date ASC')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total };
  },
};
