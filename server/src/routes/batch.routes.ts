import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { validate } from '../middleware/validator';
import { batchService } from '../services/batch.service';
import { AuthRequest } from '../types';
import { sendSuccess, sendError, parsePagination } from '../utils/helpers';

const router = Router();

// GET /api/v1/batches
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await batchService.list({
      page,
      pageSize,
      productId: req.query.productId ? parseInt(req.query.productId as string) : undefined,
      status: req.query.status as string,
      expiringWithinDays: req.query.expiringWithinDays
        ? parseInt(req.query.expiringWithinDays as string)
        : undefined,
      includeExpired: req.query.includeExpired === 'true',
    });
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/batches/expiring
router.get('/expiring', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const result = await batchService.getExpiringSummary(days);
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// POST /api/v1/batches —— 收货入批次（仅管理员）
router.post(
  '/',
  authenticate,
  adminOnly,
  validate([
    { field: 'productId', required: true, type: 'number' },
    { field: 'quantity', required: true, type: 'number', min: 0 },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await batchService.create(req.body, req.user!.sub);
      sendSuccess(res, result, '批次入库成功', 201);
    } catch (err: any) {
      sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
    }
  }
);

// POST /api/v1/batches/:id/dispose —— 报损（仅管理员）
router.post('/:id/dispose', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const result = await batchService.dispose(id, req.body.quantity, req.body.reason, req.user!.sub);
    sendSuccess(res, result, '批次已报损，库存已扣减');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

export default router;
