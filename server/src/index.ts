import fs from 'fs';
import path from 'path';
import app from './app';
import { env } from './config/env';
import { db } from './config/database';
import logger from './utils/logger';

const uploadDirs = [
  path.resolve(__dirname, '../uploads/invoices'),
  path.resolve(__dirname, '../uploads/products'),
  path.resolve(__dirname, '../logs'),
];

for (const dir of uploadDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function testDbConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    logger.info('数据库连接成功');
    return true;
  } catch (err: any) {
    logger.error('数据库连接失败:', err.message);
    return false;
  }
}

async function start() {
  const dbOk = await testDbConnection();

  if (!dbOk) {
    if (env.nodeEnv === 'production') {
      logger.error('生产环境数据库未就绪，服务启动已终止');
      process.exit(1);
      return;
    }

    logger.warn('数据库连接失败，服务器仍将启动，但数据库功能不可用');
  }

  app.listen(env.port, () => {
    logger.info('PandaMart PMS 服务已启动');
    logger.info(`端口: ${env.port}`);
    logger.info(`环境: ${env.nodeEnv}`);
    logger.info(`Health: http://localhost:${env.port}/api/v1/health`);
    logger.info(`Ready: http://localhost:${env.port}/api/v1/ready`);
  });
}

start().catch((err) => {
  logger.error('服务启动失败:', err);
  process.exit(1);
});
