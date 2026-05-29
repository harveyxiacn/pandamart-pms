import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

type JwtSubPayload = { sub?: number | string };

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function getUserRateLimitKey(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, env.jwt.secret) as JwtSubPayload;
      const userId = Number(decoded?.sub);
      if (Number.isInteger(userId) && userId > 0) {
        return `user:${userId}`;
      }
    } catch {
      // fallback to IP key
    }
  }
  return `ip:${getClientIp(req)}`;
}

function isDedicatedLimitedRoute(req: Request): boolean {
  const method = req.method.toUpperCase();
  const path = (req.originalUrl || '').split('?')[0];

  if (path === '/api/v1/health' || path === '/api/v1/ready') return true;
  if (method === 'POST' && path === '/api/v1/auth/login') return true;
  if (method === 'POST' && path === '/api/v1/invoices/upload') return true;
  if (path.startsWith('/api/v1/ai/')) return true;
  if (path.startsWith('/api/v1/export/')) return true;
  if (method === 'POST' && /^\/api\/v1\/ai-providers\/\d+\/test$/.test(path)) return true;

  return false;
}

const windowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000);
const loginMax = parsePositiveInt(process.env.RATE_LIMIT_LOGIN_MAX, 5);
const ocrMax = parsePositiveInt(process.env.RATE_LIMIT_OCR_MAX, 10);
const aiMax = parsePositiveInt(process.env.RATE_LIMIT_AI_MAX, 20);
const apiMax = parsePositiveInt(process.env.RATE_LIMIT_API_MAX, 100);
const exportMax = parsePositiveInt(process.env.RATE_LIMIT_EXPORT_MAX, 5);
const aiProviderTestMax = parsePositiveInt(process.env.RATE_LIMIT_AI_PROVIDER_TEST_MAX, 5);

export const loginLimiter = rateLimit({
  windowMs,
  max: loginMax,
  keyGenerator: (req) => `ip:${getClientIp(req)}`,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: '登录请求过于频繁，请稍后重试' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadLimiter = rateLimit({
  windowMs,
  max: ocrMax,
  keyGenerator: getUserRateLimitKey,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'OCR 上传请求过于频繁，请稍后重试' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const aiLimiter = rateLimit({
  windowMs,
  max: aiMax,
  keyGenerator: getUserRateLimitKey,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'AI 请求过于频繁，请稍后重试' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs,
  max: apiMax,
  keyGenerator: getUserRateLimitKey,
  skip: isDedicatedLimitedRoute,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const exportLimiter = rateLimit({
  windowMs,
  max: exportMax,
  keyGenerator: getUserRateLimitKey,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: '导出请求过于频繁，请稍后重试' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const aiProviderTestLimiter = rateLimit({
  windowMs,
  max: aiProviderTestMax,
  keyGenerator: getUserRateLimitKey,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: '测试请求过于频繁，请稍后重试' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
