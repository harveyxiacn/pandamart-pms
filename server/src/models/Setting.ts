import db from '../config/database';
import { SettingRow } from '../types';

const TABLE = 'settings';

export const SettingModel = {
  async get(key: string): Promise<string | null> {
    const row = await db(TABLE).where({ key }).first();
    return row ? row.value : null;
  },

  async getAll(): Promise<Record<string, string>> {
    const rows = await db(TABLE).select('key', 'value');
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  },

  async set(key: string, value: string, updatedBy?: number): Promise<void> {
    const existing = await db(TABLE).where({ key }).first();
    if (existing) {
      await db(TABLE).where({ key }).update({
        value,
        updated_by: updatedBy || null,
        updated_at: db.fn.now(),
      });
    } else {
      await db(TABLE).insert({
        key,
        value,
        updated_by: updatedBy || null,
      });
    }
  },

  async setMany(settings: Record<string, string>, updatedBy?: number): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.set(key, value, updatedBy);
    }
  },
};
