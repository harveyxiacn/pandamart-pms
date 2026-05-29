import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { validate } from '../middleware/validator';
import { payablesService } from '../services/payables.service';
import { AuthRequest } from '../types';
import { sendSuccess, sendError } from '../utils/helpers';

const router = Router();
router.use(authenticate, adminOnly);

// GET /api/v1/payables —— 各供应商应付汇总
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const data = await payablesService.listPayables();
    sendSuccess(res, data);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/payables/:supplierId —— 某供应商发票与付款明细
router.get('/:supplierId', async (req: AuthRequest, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId as string);
    const data = await payablesService.getSupplierDetail(supplierId);
    sendSuccess(res, data);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// POST /api/v1/payables/payments —— 记录一笔付款
router.post(
  '/payments',
  validate([
    { field: 'supplierId', required: true, type: 'number' },
    { field: 'amount', required: true, type: 'number', min: 0 },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await payablesService.recordPayment(req.body, req.user!.sub);
      sendSuccess(res, result, '付款已记录', 201);
    } catch (err: any) {
      sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
    }
  }
);

export default router;
