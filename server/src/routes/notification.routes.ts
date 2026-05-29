import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { notificationService } from '../services/notification.service';
import { AuthRequest } from '../types';
import { sendSuccess, sendError, parsePagination } from '../utils/helpers';

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
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/notifications/unread-count
router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const count = await notificationService.getUnreadCount(req.user!.sub);
    sendSuccess(res, { count });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// PUT /api/v1/notifications/:id/read
router.put('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await notificationService.markAsRead(id, req.user!.sub);
    sendSuccess(res, null, '已标记为已读');
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// PUT /api/v1/notifications/read-all
router.put('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await notificationService.markAllAsRead(req.user!.sub);
    sendSuccess(res, null, '全部标记为已读');
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

export default router;
