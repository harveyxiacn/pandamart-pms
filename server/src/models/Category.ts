import db from '../config/database';
import { CategoryRow } from '../types';

const TABLE = 'categories';

export const CategoryModel = {
  async findById(id: number): Promise<CategoryRow | undefined> {
    return db(TABLE).where({ id }).first();
  },

  async findAll(): Promise<CategoryRow[]> {
    return db(TABLE).orderBy('sort_order', 'asc');
  },

  async create(data: Partial<CategoryRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(id: number, data: Partial<CategoryRow>): Promise<number> {
    return db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() });
  },

  async delete(id: number): Promise<number> {
    return db(TABLE).where({ id }).delete();
  },

  async hasProducts(id: number): Promise<boolean> {
    const result = await db('products').where('category_id', id).whereNull('deleted_at').count('id as count').first();
    return Number(result?.count || 0) > 0;
  },

  async hasChildren(id: number): Promise<boolean> {
    const result = await db(TABLE).where('parent_id', id).count('id as count').first();
    return Number(result?.count || 0) > 0;
  },

  async getProductCount(id: number): Promise<number> {
    const result = await db('products').where('category_id', id).whereNull('deleted_at').count('id as count').first();
    return Number(result?.count || 0);
  },
};
