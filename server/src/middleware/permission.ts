import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { sendError } from '../utils/helpers';

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', '未认证');
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(res, 403, 'FORBIDDEN', '权限不足');
      return;
    }

    next();
  };
}

export const adminOnly = requireRole('admin');
export const allRoles = requireRole('admin', 'staff');
