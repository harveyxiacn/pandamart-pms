import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import app from './app';
import { env } from './config/env';
import { db } from './config/database';
import logger from './utils/logger';

// 低内存 VPS（systemd MemoryMax=400M）下限制 sharp/libvips 的并发与缓存，
// 避免并发发票图片处理时 RSS 飙升触发 OOM-kill。
sharp.concurrency(1);
sharp.cache({ memory: 64 });

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

  const server = app.listen(env.port, () => {
    logger.info('PandaMart PMS 服务已启动');
    logger.info(`端口: ${env.port}`);
    logger.info(`环境: ${env.nodeEnv}`);
    logger.info(`Health: http://localhost:${env.port}/api/v1/health`);
    logger.info(`Ready: http://localhost:${env.port}/api/v1/ready`);
  });

  // 优雅停机：部署/systemctl restart 会发 SIGTERM。先停止接收新连接，
  // 排空在途请求后再销毁连接池，避免截断在途的库存/金额写事务。
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`收到 ${signal}，开始优雅停机...`);
    server.close(async () => {
      try {
        await db.destroy();
      } catch {
        /* ignore pool destroy errors */
      }
      logger.info('HTTP 服务与数据库连接已关闭，进程退出');
      process.exit(0);
    });
    // 兜底：超过 12s 仍未排空则强制退出（systemd TimeoutStopSec 应略大于此值）
    setTimeout(() => {
      logger.warn('优雅停机超时，强制退出');
      process.exit(1);
    }, 12000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// 进程级兜底：未捕获异常 / 未处理拒绝时结构化记录并退出，交由 systemd 重启，
// 而非让进程进入不确定状态后静默崩溃。
process.on('uncaughtException', (err) => {
  logger.error('未捕获异常，进程即将退出:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝，进程即将退出:', reason);
  process.exit(1);
});

start().catch((err) => {
  logger.error('服务启动失败:', err);
  process.exit(1);
});
