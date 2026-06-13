import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { validate } from '../middleware/validator';
import { inventoryService } from '../services/inventory.service';
import { AuthRequest } from '../types';
import { sendSuccess, parsePagination } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();

// GET /api/v1/inventory
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await inventoryService.getAll({
      page,
      pageSize,
      keyword: req.query.keyword as string,
      categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
      alertOnly: req.query.alertOnly === 'true',
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
    });
    sendSuccess(res, result);
  } catch (err: any) {
    sendRouteError(res, err, '获取库存列表失败');
  }
});

// POST /api/v1/inventory/:productId/adjust
router.post(
  '/:productId/adjust',
  authenticate,
  adminOnly,
  validate([
    { field: 'type', required: true, enum: ['adjust', 'out', 'stocktake'] },
    { field: 'quantity', required: true, type: 'number' },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const productId = parseInt(req.params.productId as string);
      const { type, quantity, reason } = req.body;
      const result = await inventoryService.adjust(productId, type, quantity, reason || null, req.user!.sub);
      sendSuccess(res, result, '库存调整成功');
    } catch (err: any) {
      sendRouteError(res, err, '库存调整失败');
    }
  }
);

// PUT /api/v1/inventory/:productId/safe-stock
router.put(
  '/:productId/safe-stock',
  authenticate,
  adminOnly,
  validate([
    { field: 'safeStock', required: true, type: 'number', min: 0 },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const productId = parseInt(req.params.productId as string);
      await inventoryService.setSafeStock(productId, req.body.safeStock, req.user!.sub);
      sendSuccess(res, null, '安全库存设置成功');
    } catch (err: any) {
      sendRouteError(res, err, '安全库存设置失败');
    }
  }
);

// GET /api/v1/inventory/:productId/logs
router.get('/:productId/logs', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const productId = parseInt(req.params.productId as string);
    const { page, pageSize } = parsePagination(req.query);
    const result = await inventoryService.getLogs(productId, {
      page,
      pageSize,
      type: req.query.type as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    });
    sendSuccess(res, result);
  } catch (err: any) {
    sendRouteError(res, err, '获取库存日志失败');
  }
});

// POST /api/v1/inventory/stocktake
router.post(
  '/stocktake',
  authenticate,
  adminOnly,
  validate([{ field: 'items', required: true, type: 'array' }]),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await inventoryService.stocktake(req.body.items, req.body.notes || '', req.user!.sub);
      sendSuccess(res, result, `盘点完成，${result.adjustedCount}个产品库存已调整`);
    } catch (err: any) {
      sendRouteError(res, err, '库存盘点失败');
    }
  }
);

export default router;
