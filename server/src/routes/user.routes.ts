import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { validate } from '../middleware/validator';
import { UserModel } from '../models/User';
import { AuditLogModel } from '../models/AuditLog';
import { authService } from '../services/auth.service';
import { AuthRequest } from '../types';
import { sendSuccess, sendError } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();

// GET /api/v1/users
router.get('/', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const users = await UserModel.findAll();
    sendSuccess(res, users);
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// POST /api/v1/users
router.post(
  '/',
  authenticate,
  adminOnly,
  validate([
    { field: 'username', required: true, type: 'string', minLength: 2, maxLength: 50 },
    {
      field: 'password',
      required: true,
      type: 'string',
      minLength: 8,
      pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
      message: '密码至少8位且需包含字母和数字',
    },
    { field: 'displayName', required: true, type: 'string', minLength: 1 },
    { field: 'role', required: true, enum: ['admin', 'staff'] },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { username, password, displayName, email, role } = req.body;

      const existing = await UserModel.findByUsername(username);
      if (existing) {
        sendError(res, 409, 'CONFLICT', `用户名 "${username}" 已存在`);
        return;
      }

      const passwordHash = await authService.hashPassword(password);
      const userId = await UserModel.create({
        username,
        password_hash: passwordHash,
        display_name: displayName,
        email: email || null,
        role,
      } as any);

      await AuditLogModel.create({
        user_id: req.user!.sub,
        action: 'create',
        entity_type: 'user',
        entity_id: userId,
        details: JSON.stringify({ username, role }),
      });

      sendSuccess(res, { id: userId }, '用户创建成功', 201);
    } catch (err: any) {
      sendRouteError(res, err);
    }
  }
);

// PUT /api/v1/users/:id
router.put(
  '/:id',
  authenticate,
  adminOnly,
  // 与 POST 对齐：role 仅允许 admin/staff，displayName 若提供需非空。均非 required，保留部分更新语义
  validate([
    { field: 'role', enum: ['admin', 'staff'] },
    { field: 'displayName', type: 'string', minLength: 1 },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const user = await UserModel.findById(id);
      if (!user) {
        sendError(res, 404, 'NOT_FOUND', '用户不存在');
        return;
      }

      const updateData: any = {};
      if (req.body.displayName) updateData.display_name = req.body.displayName;
      if (req.body.email !== undefined) updateData.email = req.body.email || null;
      if (req.body.role) updateData.role = req.body.role;

      await UserModel.update(id, updateData);

      // 角色变更后使该用户旧令牌失效，强制以新角色重新登录（避免旧令牌携带过期角色）
      if (req.body.role && req.body.role !== user.role) {
        await UserModel.bumpTokenVersion(id);
      }

      await AuditLogModel.create({
        user_id: req.user!.sub,
        action: 'update',
        entity_type: 'user',
        entity_id: id,
        details: JSON.stringify(updateData),
      });

      sendSuccess(res, null, '用户更新成功');
    } catch (err: any) {
      sendRouteError(res, err);
    }
  }
);

// PUT /api/v1/users/:id/status
router.put(
  '/:id/status',
  authenticate,
  adminOnly,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      if (id === req.user!.sub) {
        sendError(res, 422, 'BUSINESS_ERROR', '不能禁用自己的账户');
        return;
      }

      const user = await UserModel.findById(id);
      if (!user) {
        sendError(res, 404, 'NOT_FOUND', '用户不存在');
        return;
      }

      await UserModel.update(id, { is_active: req.body.isActive } as any);

      await AuditLogModel.create({
        user_id: req.user!.sub,
        action: 'update',
        entity_type: 'user',
        entity_id: id,
        details: JSON.stringify({ isActive: req.body.isActive }),
      });

      sendSuccess(res, null, req.body.isActive ? '用户已启用' : '用户已禁用');
    } catch (err: any) {
      sendRouteError(res, err);
    }
  }
);

// PUT /api/v1/users/:id/reset-password
router.put(
  '/:id/reset-password',
  authenticate,
  adminOnly,
  validate([{
    field: 'newPassword',
    required: true,
    type: 'string',
    minLength: 8,
    pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
    message: '密码至少8位且需包含字母和数字',
  }]),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const user = await UserModel.findById(id);
      if (!user) {
        sendError(res, 404, 'NOT_FOUND', '用户不存在');
        return;
      }

      const passwordHash = await authService.hashPassword(req.body.newPassword);
      await UserModel.update(id, { password_hash: passwordHash } as any);
      // 管理员重置密码后使该用户旧令牌全部失效
      await UserModel.bumpTokenVersion(id);

      await AuditLogModel.create({
        user_id: req.user!.sub,
        action: 'update',
        entity_type: 'user',
        entity_id: id,
        details: JSON.stringify({ action: 'reset_password' }),
      });

      sendSuccess(res, null, '密码重置成功');
    } catch (err: any) {
      sendRouteError(res, err);
    }
  }
);

export default router;
