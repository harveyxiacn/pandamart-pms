import db from '../config/database';
import { InventoryRow } from '../types';

const TABLE = 'inventory';

export const InventoryModel = {
  async findByProductId(productId: number): Promise<InventoryRow | undefined> {
    return db(TABLE).where('product_id', productId).first();
  },

  async findAll(filters?: {
    keyword?: string;
    categoryId?: number;
    alertOnly?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ items: any[]; total: number; summary: any }> {
    const query = db(TABLE)
      .select(
        'inventory.*',
        'products.id as product_id',
        'products.name_en',
        'products.name_zh',
        'products.sku',
        'categories.name as category_name'
      )
      .join('products', 'inventory.product_id', 'products.id')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .whereNull('products.deleted_at');

    if (filters?.keyword) {
      query.where(function () {
        this.where('products.name_en', 'like', `%${filters.keyword}%`)
          .orWhere('products.name_zh', 'like', `%${filters.keyword}%`)
          .orWhere('products.sku', 'like', `%${filters.keyword}%`);
      });
    }
    if (filters?.categoryId) query.where('products.category_id', filters.categoryId);
    if (filters?.alertOnly) {
      query.whereRaw('inventory.quantity < inventory.safe_stock');
    }

    const countQuery = db(TABLE)
      .join('products', 'inventory.product_id', 'products.id')
      .whereNull('products.deleted_at');
    if (filters?.keyword) {
      countQuery.where(function () {
        this.where('products.name_en', 'like', `%${filters.keyword}%`)
          .orWhere('products.name_zh', 'like', `%${filters.keyword}%`);
      });
    }
    if (filters?.categoryId) countQuery.where('products.category_id', filters.categoryId);
    if (filters?.alertOnly) countQuery.whereRaw('inventory.quantity < inventory.safe_stock');

    const countResult = await countQuery.count('inventory.id as total').first();
    const total = Number(countResult?.total || 0);

    // Summary
    const summaryResult = await db(TABLE)
      .join('products', 'inventory.product_id', 'products.id')
      .whereNull('products.deleted_at')
      .select(
        db.raw('COUNT(*) as totalProducts'),
        db.raw('SUM(CASE WHEN inventory.safe_stock IS NOT NULL AND inventory.quantity < inventory.safe_stock THEN 1 ELSE 0 END) as lowStockCount'),
        db.raw('SUM(CASE WHEN inventory.quantity <= 0 THEN 1 ELSE 0 END) as outOfStockCount')
      )
      .first();

    const sortBy = filters?.sortBy || 'products.name_en';
    const sortOrder = filters?.sortOrder || 'asc';
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;

    const items = await query
      .orderBy(sortBy, sortOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items,
      total,
      summary: {
        totalProducts: Number(summaryResult?.totalProducts || 0),
        lowStockCount: Number(summaryResult?.lowStockCount || 0),
        outOfStockCount: Number(summaryResult?.outOfStockCount || 0),
      },
    };
  },

  async upsert(productId: number, data: Partial<InventoryRow>): Promise<void> {
    const existing = await db(TABLE).where('product_id', productId).first();
    if (existing) {
      await db(TABLE).where('product_id', productId).update({ ...data, updated_at: db.fn.now() });
    } else {
      await db(TABLE).insert({ product_id: productId, ...data });
    }
  },

  async adjustQuantity(productId: number, delta: number): Promise<{ before: number; after: number }> {
    const inv = await db(TABLE).where('product_id', productId).first();
    const before = Number(inv?.quantity || 0);
    const after = before + delta;

    if (inv) {
      await db(TABLE).where('product_id', productId).update({ quantity: after, updated_at: db.fn.now() });
    } else {
      await db(TABLE).insert({ product_id: productId, quantity: after });
    }

    return { before, after };
  },

  async setQuantity(productId: number, quantity: number): Promise<{ before: number; after: number }> {
    const inv = await db(TABLE).where('product_id', productId).first();
    const before = Number(inv?.quantity || 0);

    if (inv) {
      await db(TABLE).where('product_id', productId).update({ quantity, updated_at: db.fn.now() });
    } else {
      await db(TABLE).insert({ product_id: productId, quantity });
    }

    return { before, after: quantity };
  },

  async setSafeStock(productId: number, safeStock: number): Promise<void> {
    const inv = await db(TABLE).where('product_id', productId).first();
    if (inv) {
      await db(TABLE).where('product_id', productId).update({ safe_stock: safeStock, updated_at: db.fn.now() });
    } else {
      await db(TABLE).insert({ product_id: productId, safe_stock: safeStock });
    }
  },

  async updateRestock(productId: number, quantity: number, date: string): Promise<void> {
    await db(TABLE).where('product_id', productId).update({
      last_restock_date: date,
      last_restock_quantity: quantity,
      updated_at: db.fn.now(),
    });
  },

  async getLowStockProducts(): Promise<any[]> {
    return db(TABLE)
      .select(
        'inventory.*',
        'products.name_en',
        'products.name_zh',
        'products.sku'
      )
      .join('products', 'inventory.product_id', 'products.id')
      .whereNull('products.deleted_at')
      .whereNotNull('inventory.safe_stock')
      .whereRaw('inventory.quantity < inventory.safe_stock')
      .orderByRaw('(inventory.safe_stock - inventory.quantity) DESC');
  },
};
