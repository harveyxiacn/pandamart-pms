import db from '../config/database';
import { SupplierTemplateRow } from '../types';

const TABLE = 'supplier_templates';

export const SupplierTemplateModel = {
  async findBySupplierId(supplierId: number): Promise<SupplierTemplateRow | undefined> {
    return db(TABLE).where('supplier_id', supplierId).first();
  },

  async create(data: Partial<SupplierTemplateRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async upsert(supplierId: number, data: Partial<SupplierTemplateRow>): Promise<void> {
    const existing = await db(TABLE).where('supplier_id', supplierId).first();
    if (existing) {
      await db(TABLE).where('supplier_id', supplierId).update({
        ...data,
        success_count: db.raw('success_count + 1'),
        last_used_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    } else {
      await db(TABLE).insert({
        supplier_id: supplierId,
        success_count: 1,
        last_used_at: db.fn.now(),
        ...data,
      });
    }
  },

  async incrementSuccess(supplierId: number): Promise<void> {
    await db(TABLE).where('supplier_id', supplierId).update({
      success_count: db.raw('success_count + 1'),
      last_used_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
  },
};
