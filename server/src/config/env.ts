import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`必须配置环境变量: ${name}`);
  }
  return value;
}

function readAiEncryptionKey(): string {
  const key = requireEnv('AI_ENCRYPTION_KEY');
  if (key.length !== 32) {
    throw new Error('AI_ENCRYPTION_KEY 必须是 32 位字符串');
  }
  return key;
}

// parseInt 兜底：非法/缺失值回退到默认，避免 NaN 端口/超时静默生效
function parseIntSafe(value: string | undefined, fallback: number): number {
  const n = parseInt((value ?? '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  port: parseIntSafe(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseIntSafe(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'pandamart_pms',
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: parseIntSafe(process.env.JWT_EXPIRES_IN, 86400),
  },

  aiEncryptionKey: readAiEncryptionKey(),

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: parseIntSafe(process.env.MAX_FILE_SIZE, 20971520),
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseIntSafe(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
};

// 启动期安全校验（非致命：仅告警，避免生产环境因历史弱配置无法启动）。
// 收紧为硬失败前，请先确保生产 .env 满足以下条件。
const isProd = env.nodeEnv === 'production';
if (env.jwt.secret.length < 32) {
  // 生产环境硬失败（与 AI_ENCRYPTION_KEY 一致），杜绝弱密钥被离线暴力破解伪造令牌；非生产仅告警，避免阻塞开发。
  if (isProd) {
    throw new Error('JWT_SECRET 长度不足 32 位，生产环境拒绝启动，请改用 ≥32 位高强度随机串。');
  }
  console.warn('[env] 警告: JWT_SECRET 长度不足 32 位，存在被离线暴力破解伪造令牌的风险，建议改用 ≥32 位高强度随机串。');
}
if (isProd && !(process.env.DB_PASSWORD || '').trim()) {
  console.warn('[env] 警告: 生产环境未设置 DB_PASSWORD，正在以空密码连接数据库。');
}
if (isProd && env.db.user === 'root') {
  console.warn('[env] 警告: 生产环境使用 root 数据库账户，建议改用最小权限专用账户。');
}
