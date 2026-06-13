import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthRequest, JwtPayload } from '../types';
import { UserModel } from '../models/User';
import { sendError } from '../utils/helpers';

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'UNAUTHORIZED', '未提供认证令牌');
    return;
  }

  const token = authHeader.substring(7);
  let decoded: JwtPayload;

  try {
    decoded = jwt.verify(token, env.jwt.secret) as unknown as JwtPayload;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      sendError(res, 401, 'UNAUTHORIZED', '认证令牌已过期');
    } else {
      sendError(res, 401, 'UNAUTHORIZED', '无效的认证令牌');
    }
    return;
  }

  const userId = Number(decoded.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    sendError(res, 401, 'UNAUTHORIZED', '无效的认证令牌');
    return;
  }

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      sendError(res, 401, 'UNAUTHORIZED', '用户不存在或已被删除');
      return;
    }

    if (!user.is_active) {
      sendError(res, 401, 'UNAUTHORIZED', '账户已被禁用');
      return;
    }

    // 令牌失效校验：token 的 tv 必须与库中当前 token_version 一致。
    // 改密/管理员重置/改角色会递增 token_version，使此前签发的令牌立即失效。
    // 旧令牌不含 tv（视为 0），与初始 token_version=0 相等，故升级当下不强制全员重登。
    if (Number(decoded.tv ?? 0) !== Number(user.token_version ?? 0)) {
      sendError(res, 401, 'TOKEN_REVOKED', '登录状态已失效，请重新登录');
      return;
    }

    req.user = {
      sub: user.id,
      username: user.username,
      role: user.role,
      iat: decoded.iat,
      exp: decoded.exp,
    };
    next();
  } catch (err: any) {
    sendError(res, 503, 'AUTH_LOOKUP_FAILED', err.message || '认证状态校验失败，请稍后重试');
  }
}
