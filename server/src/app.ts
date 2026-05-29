import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { corsOptions } from './config/cors';
import { env } from './config/env';
import db from './config/database';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { sendSuccess, sendError } from './utils/helpers';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import invoiceRoutes from './routes/invoice.routes';
import productRoutes from './routes/product.routes';
import inventoryRoutes from './routes/inventory.routes';
import salesRoutes from './routes/sales.routes';
import batchRoutes from './routes/batch.routes';
import payablesRoutes from './routes/payables.routes';
import supplierRoutes from './routes/supplier.routes';
import categoryRoutes from './routes/category.routes';
import analyticsRoutes from './routes/analytics.routes';
import notificationRoutes from './routes/notification.routes';
import settingRoutes from './routes/setting.routes';
import aiProviderRoutes from './routes/ai-provider.routes';
import aiChatRoutes from './routes/ai-chat.routes';
import auditLogRoutes from './routes/audit-log.routes';
import exportRoutes from './routes/export.routes';

const app = express();

// 信任反向代理（生产环境部署在 nginx/cPanel 之后），使 req.ip / X-Forwarded-For 可靠
if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// 安全响应头（X-Frame-Options / X-Content-Type-Options / HSTS 等）。
// crossOriginResourcePolicy 放宽到 cross-origin，使前端在不同源时仍能加载 /uploads 发票图片。
// CSP 暂时关闭：前端为构建后的 SPA，启用默认 CSP 会拦截其内联脚本/样式，
// 需专门配置 directives 后再开启。
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
app.use('/api', apiLimiter);

app.get('/api/v1/health', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: env.nodeEnv,
  });
});

app.get('/api/v1/ready', async (_req, res) => {
  try {
    await db.raw('SELECT 1');
    sendSuccess(res, {
      ready: true,
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    sendError(res, 503, 'DB_UNAVAILABLE', '数据库服务不可用，请先启动并配置 MySQL。');
  }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/sales', salesRoutes);
app.use('/api/v1/batches', batchRoutes);
app.use('/api/v1/payables', payablesRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/settings', settingRoutes);
app.use('/api/v1/ai-providers', aiProviderRoutes);
app.use('/api/v1/ai', aiChatRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);
app.use('/api/v1/export', exportRoutes);

if (env.nodeEnv === 'production') {
  const publicDir = path.resolve(__dirname, '../public');
  app.use(express.static(publicDir));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: '接口不存在' },
    });
  });
}

app.use(errorHandler);

export default app;
