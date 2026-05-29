import db from '../config/database';
import { AuditLogRow } from '../types';

const TABLE = 'audit_logs';

export const AuditLogModel = {
  async create(data: Partial<AuditLogRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async findAll(filters?: {
    userId?: number;
    action?: string;
    entityType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: any[]; total: number }> {
    const query = db(TABLE)
      .select('audit_logs.*', 'users.display_name as user_display_name', 'users.username')
      .leftJoin('users', 'audit_logs.user_id', 'users.id');

    if (filters?.userId) query.where('audit_logs.user_id', filters.userId);
    if (filters?.action) query.where('audit_logs.action', filters.action);
    if (filters?.entityType) query.where('audit_logs.entity_type', filters.entityType);
    if (filters?.dateFrom) query.where('audit_logs.created_at', '>=', filters.dateFrom);
    if (filters?.dateTo) query.where('audit_logs.created_at', '<=', `${filters.dateTo} 23:59:59`);

    const countQuery = db(TABLE);
    if (filters?.userId) countQuery.where('user_id', filters.userId);
    if (filters?.action) countQuery.where('action', filters.action);
    if (filters?.entityType) countQuery.where('entity_type', filters.entityType);
    if (filters?.dateFrom) countQuery.where('created_at', '>=', filters.dateFrom);
    if (filters?.dateTo) countQuery.where('created_at', '<=', `${filters.dateTo} 23:59:59`);

    const countResult = await countQuery.count('id as total').first();
    const total = Number(countResult?.total || 0);

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;

    const items = await query
      .orderBy('audit_logs.created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total };
  },
};
