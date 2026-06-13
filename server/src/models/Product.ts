import db from '../config/database';
import { ProductRow } from '../types';

const TABLE = 'products';

// 排序字段白名单（裸列名，orderBy 时再加 products. 前缀），防止把任意 sortBy 拼进 SQL 标识符触发未知列报错/信息泄露
const ALLOWED_SORT_FIELDS = [
  'id',
  'name_en',
  'name_zh',
  'sku',
  'created_at',
  'updated_at',
  'default_price',
];
const DEFAULT_SORT_FIELD = 'name_en';

export const ProductModel = {
  async findById(id: number): Promise<ProductRow | undefined> {
    return db(TABLE).where({ id }).whereNull('deleted_at').first();
  },

  async findAll(filters?: {
    keyword?: string;
    categoryId?: number;
    supplierId?: number;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ items: any[]; total: number }> {
    const query = db(TABLE)
      .select(
        'products.*',
        'categories.name as category_name',
        'suppliers.name as supplier_name'
      )
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .leftJoin('suppliers', 'products.default_supplier_id', 'suppliers.id')
      .whereNull('products.deleted_at');

    if (filters?.keyword) {
      query.where(function () {
        this.where('products.name_en', 'like', `%${filters.keyword}%`)
          .orWhere('products.name_zh', 'like', `%${filters.keyword}%`)
          .orWhere('products.sku', 'like', `%${filters.keyword}%`);
      });
    }
    if (filters?.categoryId) query.where('products.category_id', filters.categoryId);
    if (filters?.supplierId) query.where('products.default_supplier_id', filters.supplierId);
    if (filters?.isActive !== undefined) query.where('products.is_active', filters.isActive);

    const countQuery = db(TABLE).whereNull('deleted_at');
    if (filters?.keyword) {
      countQuery.where(function () {
        this.where('name_en', 'like', `%${filters.keyword}%`)
          .orWhere('name_zh', 'like', `%${filters.keyword}%`)
          .orWhere('sku', 'like', `%${filters.keyword}%`);
      });
    }
    if (filters?.categoryId) countQuery.where('category_id', filters.categoryId);
    if (filters?.supplierId) countQuery.where('default_supplier_id', filters.supplierId);
    if (filters?.isActive !== undefined) countQuery.where('is_active', filters.isActive);

    const countResult = await countQuery.count('id as total').first();
    const total = Number(countResult?.total || 0);

    const requestedSort = filters?.sortBy || '';
    const sortBy = ALLOWED_SORT_FIELDS.includes(requestedSort) ? requestedSort : DEFAULT_SORT_FIELD;
    const sortOrder = filters?.sortOrder || 'desc';
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;

    const items = await query
      .orderBy(`products.${sortBy}`, sortOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total };
  },

  async create(data: Partial<ProductRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(id: number, data: Partial<ProductRow>): Promise<number> {
    return db(TABLE).where({ id }).whereNull('deleted_at').update({ ...data, updated_at: db.fn.now() });
  },

  async softDelete(id: number): Promise<number> {
    return db(TABLE).where({ id }).update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
  },

  async search(keyword: string, limit = 10): Promise<ProductRow[]> {
    return db(TABLE)
      .whereNull('deleted_at')
      .where('is_active', true)
      .where(function () {
        this.where('name_en', 'like', `%${keyword}%`)
          .orWhere('name_zh', 'like', `%${keyword}%`)
          .orWhere('sku', 'like', `%${keyword}%`);
      })
      .limit(limit);
  },

  async findBySku(sku: string): Promise<ProductRow | undefined> {
    return db(TABLE).where({ sku }).whereNull('deleted_at').first();
  },

  async findByBarcode(barcode: string): Promise<any | undefined> {
    return db(TABLE)
      .select('products.*', 'categories.name as category_name', 'suppliers.name as supplier_name')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .leftJoin('suppliers', 'products.default_supplier_id', 'suppliers.id')
      .where('products.barcode', barcode)
      .whereNull('products.deleted_at')
      .first();
  },

  async findBySupplier(supplierId: number): Promise<ProductRow[]> {
    return db(TABLE)
      .where('default_supplier_id', supplierId)
      .whereNull('deleted_at')
      .orderBy('name_en', 'asc');
  },
};
