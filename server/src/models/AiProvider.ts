import db from '../config/database';
import { AiProviderRow } from '../types';

const TABLE = 'ai_providers';

export const AiProviderModel = {
  async findById(id: number): Promise<AiProviderRow | undefined> {
    return db(TABLE).where({ id }).first();
  },

  async findAll(): Promise<AiProviderRow[]> {
    return db(TABLE).orderBy('created_at', 'desc');
  },

  async findByPurpose(purpose: string): Promise<AiProviderRow | undefined> {
    return db(TABLE)
      .where(function () {
        this.where('purpose', purpose).orWhere('purpose', 'all');
      })
      .where('is_active', true)
      .orderBy('is_default', 'desc')
      .first();
  },

  async findDefault(): Promise<AiProviderRow | undefined> {
    return db(TABLE).where({ is_default: true, is_active: true }).first();
  },

  async create(data: Partial<AiProviderRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(id: number, data: Partial<AiProviderRow>): Promise<number> {
    return db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() });
  },

  async delete(id: number): Promise<number> {
    return db(TABLE).where({ id }).delete();
  },

  async setDefault(id: number): Promise<void> {
    await db(TABLE).update({ is_default: false, updated_at: db.fn.now() });
    await db(TABLE).where({ id }).update({ is_default: true, updated_at: db.fn.now() });
  },

  async updateTestResult(id: number, success: boolean, latencyMs: number): Promise<void> {
    await db(TABLE).where({ id }).update({
      last_test_at: db.fn.now(),
      last_test_success: success,
      last_test_latency_ms: latencyMs,
      updated_at: db.fn.now(),
    });
  },
};
