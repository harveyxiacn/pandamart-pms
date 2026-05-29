import db from '../config/database';
import { UserRow } from '../types';

const TABLE = 'users';

export const UserModel = {
  async findById(id: number): Promise<UserRow | undefined> {
    return db(TABLE).where({ id }).first();
  },

  async findByUsername(username: string): Promise<UserRow | undefined> {
    return db(TABLE).where({ username }).first();
  },

  async findAll(filters?: { role?: string; isActive?: boolean }): Promise<UserRow[]> {
    const query = db(TABLE).select('id', 'username', 'display_name', 'email', 'role', 'is_active', 'last_login_at', 'created_at', 'updated_at');
    if (filters?.role) query.where('role', filters.role);
    if (filters?.isActive !== undefined) query.where('is_active', filters.isActive);
    return query.orderBy('created_at', 'desc');
  },

  async create(data: Partial<UserRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(id: number, data: Partial<UserRow>): Promise<number> {
    return db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() });
  },

  async updateLoginSuccess(id: number): Promise<void> {
    await db(TABLE).where({ id }).update({
      last_login_at: db.fn.now(),
      login_attempts: 0,
      locked_until: null,
      updated_at: db.fn.now(),
    });
  },

  async incrementLoginAttempts(id: number): Promise<number> {
    await db(TABLE).where({ id }).increment('login_attempts', 1).update({ updated_at: db.fn.now() });
    const user = await db(TABLE).where({ id }).select('login_attempts').first();
    return user?.login_attempts || 0;
  },

  async lockAccount(id: number, until: Date): Promise<void> {
    await db(TABLE).where({ id }).update({
      locked_until: until,
      updated_at: db.fn.now(),
    });
  },
};
