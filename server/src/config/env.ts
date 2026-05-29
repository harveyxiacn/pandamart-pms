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

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'pandamart_pms',
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '86400', 10),
  },

  aiEncryptionKey: readAiEncryptionKey(),

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '20971520', 10),
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
};
