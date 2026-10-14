import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { aliasService } from '../services/alias.service';
import { AuditLogModel } from '../models/AuditLog';
import { AuthRequest } from '../types';
import { sendSuccess } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();

// 供应商商品别名学习映射属系统级配置，仅管理员可见/可管理
router.use(authenticate, adminOnly);

// GET /api/v1/product-aliases?supplierId=&limit=
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const items = await aliasService.list({
      supplierId: Number.isFinite(supplierId as number) ? (supplierId as number) : undefined,
      limit: Number.isFinite(limit as number) ? (limit as number) : undefined,
    });
    sendSuccess(res, { items });
  } catch (err: any) {
    sendRouteError(res, err, '获取已学习别名失败');
  }
});

// DELETE /api/v1/product-aliases/:id —— 删除误学习的映射
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const removed = await aliasService.remove(id);
    if (removed > 0) {
      await AuditLogModel.create({
        user_id: req.user!.sub,
        action: 'delete_product_alias',
        entity_type: 'supplier_product_alias',
        entity_id: id,
        details: JSON.stringify({ id }),
      });
    }
    sendSuccess(res, null, removed > 0 ? '已删除该条已学习匹配' : '记录不存在');
  } catch (err: any) {
    sendRouteError(res, err, '删除已学习别名失败');
  }
});

export default router;
