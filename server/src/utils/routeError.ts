import type { Response } from 'express';
import { sendError } from './helpers';
import logger from './logger';

function normalizeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
}

export function isDatabaseConnectionError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'PROTOCOL_CONNECTION_LOST'].includes(code)) {
    return true;
  }

  const message = normalizeErrorMessage(err);
  return [
    'ECONNREFUSED',
    'connect ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'PROTOCOL_CONNECTION_LOST',
    'Can\'t connect to MySQL server',
    'Access denied for user',
    'Unknown database',
    'Too many connections',
  ].some((pattern) => message.includes(pattern));
}

export function sendRouteError(
  res: Response,
  err: unknown,
  fallbackMessage = '操作失败'
): void {
  const appError = err as {
    statusCode?: number;
    code?: string;
    message?: string;
    details?: any[];
  };

  if (appError?.statusCode && appError?.code) {
    sendError(res, appError.statusCode, appError.code, appError.message || fallbackMessage, appError.details);
    return;
  }

  if (isDatabaseConnectionError(err)) {
    logger.error('请求处理失败（数据库不可用）:', err);
    sendError(res, 503, 'DB_UNAVAILABLE', '数据库服务不可用，请先启动并配置 MySQL。');
    return;
  }

  // 未知错误：完整堆栈只落服务端日志，响应体沿用（业务层有意透出的）中文消息或回退文案
  logger.error('请求处理失败:', err);
  sendError(res, 500, 'INTERNAL_ERROR', normalizeErrorMessage(err) || fallbackMessage);
}
