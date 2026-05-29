import winston from 'winston';
import path from 'path';
import { env } from '../config/env';

const logDir = path.resolve(__dirname, '../../logs');

// 敏感字段脱敏：避免密码/令牌/密钥等被误记入日志文件
const SENSITIVE_KEYS = [
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'authorization',
  'apikey',
  'api_key',
  'api_key_encrypted',
  'secret',
  'jwt',
  'pass',
];

function redactSensitive(value: any, depth = 0): any {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEYS.includes(k.toLowerCase()) ? '***REDACTED***' : redactSensitive(v, depth + 1);
  }
  return out;
}

const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp') continue;
    (info as Record<string, any>)[key] = redactSensitive((info as Record<string, any>)[key]);
  }
  return info;
});

const logger = winston.createLogger({
  level: env.isDev ? 'debug' : 'info',
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pandamart-pms' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

export default logger;
