import db from '../config/database';
import { NotificationRow } from '../types';

const TABLE = 'notifications';

export const NotificationModel = {
  async create(data: Partial<NotificationRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async findByUserId(userId: number, filters?: {
    isRead?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: NotificationRow[]; total: number }> {
    const query = db(TABLE).where('user_id', userId);
    if (filters?.isRead !== undefined) query.where('is_read', filters.isRead);

    const countQuery = db(TABLE).where('user_id', userId);
    if (filters?.isRead !== undefined) countQuery.where('is_read', filters.isRead);

    const countResult = await countQuery.count('id as total').first();
    const total = Number(countResult?.total || 0);

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;

    const items = await query
      .orderBy('created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total };
  },

  async getUnreadCount(userId: number): Promise<number> {
    const result = await db(TABLE)
      .where({ user_id: userId, is_read: false })
      .count('id as count')
      .first();
    return Number(result?.count || 0);
  },

  async markAsRead(id: number, userId: number): Promise<number> {
    return db(TABLE).where({ id, user_id: userId }).update({ is_read: true });
  },

  async markAllAsRead(userId: number): Promise<number> {
    return db(TABLE).where({ user_id: userId, is_read: false }).update({ is_read: true });
  },

  async createForAllAdmins(data: Omit<Partial<NotificationRow>, 'user_id'>): Promise<void> {
    const admins = await db('users').where({ role: 'admin', is_active: true }).select('id');
    for (const admin of admins) {
      await db(TABLE).insert({ ...data, user_id: admin.id });
    }
  },
};
