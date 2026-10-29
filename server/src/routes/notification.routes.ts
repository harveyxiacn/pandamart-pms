import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { notificationService } from '../services/notification.service';
import { AuthRequest } from '../types';
import { sendSuccess, parsePagination, buildPagination } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();

// GET /api/v1/notifications
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await notificationService.getNotifications(req.user!.sub, {
      page,
      pageSize,
      isRead: req.query.isRead !== undefined ? req.query.isRead === 'true' : undefined,
    });
    // 与其他列表接口统一分页结构（保留 total 兼容旧调用方）
    sendSuccess(res, {
      items: result.items,
      total: result.total,
      pagination: buildPagination(page, pageSize, result.total),
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// GET /api/v1/notifications/unread-count
router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const count = await notificationService.getUnreadCount(req.user!.sub);
    sendSuccess(res, { count });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// PUT /api/v1/notifications/:id/read
router.put('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await notificationService.markAsRead(id, req.user!.sub);
    sendSuccess(res, null, '已标记为已读');
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// PUT /api/v1/notifications/read-all
router.put('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await notificationService.markAllAsRead(req.user!.sub);
    sendSuccess(res, null, '全部标记为已读');
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

export default router;
