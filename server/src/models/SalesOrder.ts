import db from '../config/database';

const TABLE = 'sales_orders';

export const SalesOrderModel = {
  async findAll(filters?: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: any[]; total: number }> {
    const base = db(TABLE);
    const apply = (q: any) => {
      if (filters?.status) q.where('sales_orders.status', filters.status);
      if (filters?.dateFrom) q.where('sales_orders.created_at', '>=', filters.dateFrom);
      if (filters?.dateTo) q.where('sales_orders.created_at', '<=', `${filters.dateTo} 23:59:59`);
      return q;
    };

    const countResult = await apply(base.clone()).count('id as total').first();
    const total = Number(countResult?.total || 0);

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;

    const items = await apply(
      db(TABLE)
        .select(
          'sales_orders.*',
          'users.display_name as sold_by_name'
        )
        .leftJoin('users', 'sales_orders.sold_by', 'users.id')
    )
      .orderBy('sales_orders.created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total };
  },

  async findById(id: number): Promise<any | undefined> {
    return db(TABLE)
      .select('sales_orders.*', 'users.display_name as sold_by_name')
      .leftJoin('users', 'sales_orders.sold_by', 'users.id')
      .where('sales_orders.id', id)
      .first();
  },

  async findItems(salesOrderId: number): Promise<any[]> {
    return db('sales_items')
      .select(
        'sales_items.*',
        'products.name_en as product_name_en',
        'products.name_zh as product_name_zh',
        'products.sku as product_sku'
      )
      .leftJoin('products', 'sales_items.product_id', 'products.id')
      .where('sales_items.sales_order_id', salesOrderId)
      .orderBy('sales_items.id', 'asc');
  },
};
