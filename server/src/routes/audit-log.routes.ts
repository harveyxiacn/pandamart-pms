import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { AuditLogModel } from '../models/AuditLog';
import { AuthRequest } from '../types';
import { sendSuccess, sendError, parsePagination, buildPagination } from '../utils/helpers';

const router = Router();

// GET /api/v1/audit-logs
router.get('/', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const { items, total } = await AuditLogModel.findAll({
      page,
      pageSize,
      userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
      action: req.query.action as string,
      entityType: req.query.entityType as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    });

    const pagination = buildPagination(page, pageSize, total);

    sendSuccess(res, {
      items: items.map((item: any) => ({
        id: item.id,
        user: item.user_id ? {
          id: item.user_id,
          username: item.username,
          displayName: item.user_display_name,
        } : null,
        action: item.action,
        entityType: item.entity_type,
        entityId: item.entity_id,
        details: item.details,
        ipAddress: item.ip_address,
        createdAt: item.created_at,
      })),
      pagination,
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

export default router;
