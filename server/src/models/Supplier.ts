import db from '../config/database';
import { SupplierRow } from '../types';

const TABLE = 'suppliers';

export const SupplierModel = {
  async findById(id: number): Promise<SupplierRow | undefined> {
    return db(TABLE).where({ id }).whereNull('deleted_at').first();
  },

  async findAll(filters?: {
    keyword?: string;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: SupplierRow[]; total: number }> {
    const query = db(TABLE).whereNull('deleted_at');

    if (filters?.keyword) {
      query.where(function () {
        this.where('name', 'like', `%${filters.keyword}%`)
          .orWhere('code', 'like', `%${filters.keyword}%`);
      });
    }
    if (filters?.isActive !== undefined) {
      query.where('is_active', filters.isActive);
    }

    const countResult = await query.clone().count('id as total').first();
    const total = Number(countResult?.total || 0);

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const items = await query
      .orderBy('created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total };
  },

  async create(data: Partial<SupplierRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(id: number, data: Partial<SupplierRow>): Promise<number> {
    return db(TABLE).where({ id }).whereNull('deleted_at').update({ ...data, updated_at: db.fn.now() });
  },

  async softDelete(id: number): Promise<number> {
    return db(TABLE).where({ id }).update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
  },

  async findByName(name: string): Promise<SupplierRow | undefined> {
    return db(TABLE).whereNull('deleted_at').where('name', 'like', `%${name}%`).first();
  },
};
