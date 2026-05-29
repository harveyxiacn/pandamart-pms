import db from '../config/database';
import { StoreRow } from '../types';

const TABLE = 'stores';

export const StoreModel = {
  async findAll(): Promise<StoreRow[]> {
    return db(TABLE).orderBy('id', 'asc');
  },

  async findById(id: number): Promise<StoreRow | undefined> {
    return db(TABLE).where('id', id).first();
  },

  async getDefault(): Promise<StoreRow | undefined> {
    return db(TABLE).where('is_default', true).first();
  },
};
