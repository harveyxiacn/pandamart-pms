import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { SettingModel } from '../models/Setting';
import { AuditLogModel } from '../models/AuditLog';
import { AuthRequest } from '../types';
import { sendSuccess } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();

// GET /api/v1/settings
router.get('/', authenticate, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await SettingModel.getAll();
    sendSuccess(res, settings);
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// PUT /api/v1/settings
router.put('/', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    await SettingModel.setMany(req.body, req.user!.sub);

    await AuditLogModel.create({
      user_id: req.user!.sub,
      action: 'update',
      entity_type: 'settings',
      details: JSON.stringify(req.body),
    });

    sendSuccess(res, null, '设置已更新');
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

export default router;
