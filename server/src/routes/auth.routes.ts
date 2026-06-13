import { Router, Response } from 'express';
import { authService } from '../services/auth.service';
import { authenticate } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validator';
import { AuditLogModel } from '../models/AuditLog';
import { AuthRequest } from '../types';
import { sendSuccess, getClientIp } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();

// POST /api/v1/auth/login
router.post(
  '/login',
  loginLimiter,
  validate([
    { field: 'username', required: true, type: 'string', minLength: 1, maxLength: 50 },
    { field: 'password', required: true, type: 'string', minLength: 8, maxLength: 128 },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { username, password } = req.body;
      const result = await authService.login(
        username,
        password,
        getClientIp(req),
        req.headers['user-agent']
      );
      sendSuccess(res, result);
    } catch (err: any) {
      sendRouteError(res, err, '登录失败');
    }
  }
);

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await authService.getProfile(req.user!.sub);
    sendSuccess(res, profile);
  } catch (err: any) {
    sendRouteError(res, err, '获取个人信息失败');
  }
});

// PUT /api/v1/auth/password
router.put(
  '/password',
  authenticate,
  validate([
    { field: 'currentPassword', required: true, type: 'string' },
    {
      field: 'newPassword',
      required: true,
      type: 'string',
      minLength: 8,
      pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
      message: '密码至少8位且需包含字母和数字',
    },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      await authService.changePassword(
        req.user!.sub,
        req.body.currentPassword,
        req.body.newPassword
      );
      await AuditLogModel.create({
        user_id: req.user!.sub,
        action: 'change_password',
        entity_type: 'user',
        entity_id: req.user!.sub,
        ip_address: getClientIp(req),
      });
      sendSuccess(res, null, '密码修改成功');
    } catch (err: any) {
      sendRouteError(res, err, '修改密码失败');
    }
  }
);

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await AuditLogModel.create({
      user_id: req.user!.sub,
      action: 'logout',
      entity_type: 'user',
      entity_id: req.user!.sub,
      ip_address: getClientIp(req),
    });
    sendSuccess(res, null, '已登出');
  } catch {
    sendSuccess(res, null, '已登出');
  }
});

export default router;
