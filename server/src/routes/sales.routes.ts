import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { validate } from '../middleware/validator';
import { salesService } from '../services/sales.service';
import { AuthRequest } from '../types';
import { sendSuccess, sendError, parsePagination } from '../utils/helpers';

const router = Router();

// GET /api/v1/sales
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await salesService.list({
      page,
      pageSize,
      status: req.query.status as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    });
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/sales/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const result = await salesService.getById(id);
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// POST /api/v1/sales —— 收银/销售出库（admin 与 staff 均可）
router.post(
  '/',
  authenticate,
  validate([{ field: 'items', required: true, type: 'array' }]),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await salesService.create(
        { items: req.body.items, note: req.body.note },
        req.user!.sub
      );
      sendSuccess(res, result, '销售出库成功');
    } catch (err: any) {
      sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
    }
  }
);

// POST /api/v1/sales/:id/void —— 作废并回补库存（仅管理员）
router.post('/:id/void', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const result = await salesService.void(id, req.user!.sub);
    sendSuccess(res, result, '销售单已作废，库存已回补');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

export default router;
