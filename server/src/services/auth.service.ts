import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserModel } from '../models/User';
import { AuditLogModel } from '../models/AuditLog';
import { JwtPayload } from '../types';
import { AppError } from '../middleware/errorHandler';

const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const STRONG_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function ensureStrongPassword(password: string): void {
  if (!STRONG_PASSWORD_PATTERN.test(password)) {
    throw new AppError(400, 'VALIDATION_ERROR', '密码至少8位且需包含字母和数字');
  }
}

export const authService = {
  async login(
    username: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ token: string; expiresIn: number; user: any }> {
    const user = await UserModel.findByUsername(username);

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
    }

    if (!user.is_active) {
      throw new AppError(401, 'INVALID_CREDENTIALS', '账户已被禁用');
    }

    // 检查账户锁定
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainMinutes = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000
      );
      throw new AppError(
        401,
        'ACCOUNT_LOCKED',
        `账户已锁定，请 ${remainMinutes} 分钟后重试`
      );
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      const attempts = await UserModel.incrementLoginAttempts(user.id);

      await AuditLogModel.create({
        user_id: user.id,
        action: 'login_failed',
        entity_type: 'user',
        entity_id: user.id,
        details: JSON.stringify({ reason: '密码错误', attempts }),
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
        await UserModel.lockAccount(user.id, lockUntil);
        throw new AppError(
          401,
          'ACCOUNT_LOCKED',
          `连续登录失败 ${MAX_LOGIN_ATTEMPTS} 次，账户已锁定 ${LOCK_DURATION_MINUTES} 分钟`
        );
      }

      throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
    }

    // 登录成功
    await UserModel.updateLoginSuccess(user.id);

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const token = jwt.sign(payload, env.jwt.secret, {
      expiresIn: env.jwt.expiresIn,
    });

    await AuditLogModel.create({
      user_id: user.id,
      action: 'login',
      entity_type: 'user',
      entity_id: user.id,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return {
      token,
      expiresIn: env.jwt.expiresIn,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        email: user.email,
      },
    };
  },

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', '用户不存在');
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      throw new AppError(400, 'VALIDATION_ERROR', '当前密码错误');
    }

    ensureStrongPassword(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await UserModel.update(userId, { password_hash: passwordHash } as any);
  },

  async getProfile(userId: number): Promise<any> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', '用户不存在');
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      email: user.email,
      lastLoginAt: user.last_login_at,
    };
  },

  async hashPassword(password: string): Promise<string> {
    ensureStrongPassword(password);
    return bcrypt.hash(password, SALT_ROUNDS);
  },
};
