import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { analyticsService } from '../services/analytics.service';
import { AuthRequest } from '../types';
import { parseBoundedInt, sendSuccess } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';
import { cached } from '../utils/cache';

const router = Router();
router.use(authenticate, adminOnly);

// 重复命中的只读聚合短时缓存（PERF-4）。数据随发票入库/销售缓慢变化，
// 30s 内的轻微滞后对单店运营可接受，换取仪表盘/分析页反复加载时的明显减负。
const TTL = 30_000;
const q = (req: AuthRequest, name: string): string =>
  `analytics:${name}:${req.query.period || ''}:${req.query.type || ''}:${req.query.dateFrom || ''}:${req.query.dateTo || ''}:${req.query.threshold || ''}:${req.query.categoryId || ''}:${req.query.days || ''}:${req.query.limit || ''}`;

// GET /api/v1/analytics/dashboard
router.get('/dashboard', async (_req: AuthRequest, res: Response) => {
  try {
    const data = await cached('analytics:dashboard', TTL, () => analyticsService.getDashboard());
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取仪表盘数据失败');
  }
});

// GET /api/v1/analytics/purchase-trend
router.get('/purchase-trend', async (req: AuthRequest, res: Response) => {
  try {
    const data = await cached(q(req, 'purchase-trend'), TTL, () =>
      analyticsService.getPurchaseTrend({
        period: req.query.period as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
      })
    );
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取采购趋势失败');
  }
});

// GET /api/v1/analytics/product-ranking
router.get('/product-ranking', async (req: AuthRequest, res: Response) => {
  try {
    const data = await cached(q(req, 'product-ranking'), TTL, () =>
      analyticsService.getProductRanking({
        type: req.query.type as string,
        limit: parseBoundedInt(req.query.limit, { defaultValue: 20, min: 1, max: 100 }),
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        categoryId: req.query.categoryId
          ? parseBoundedInt(req.query.categoryId, {
              defaultValue: 0,
              min: 1,
              max: Number.MAX_SAFE_INTEGER,
            })
          : undefined,
      })
    );
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取商品排行失败');
  }
});

// GET /api/v1/analytics/price-changes
router.get('/price-changes', async (req: AuthRequest, res: Response) => {
  try {
    const data = await cached(q(req, 'price-changes'), TTL, () =>
      analyticsService.getPriceChanges({
        threshold: req.query.threshold ? parseFloat(req.query.threshold as string) : undefined,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        limit: parseBoundedInt(req.query.limit, { defaultValue: 50, min: 1, max: 100 }),
      })
    );
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取价格波动失败');
  }
});

// GET /api/v1/analytics/supplier-distribution
router.get('/supplier-distribution', async (req: AuthRequest, res: Response) => {
  try {
    const data = await cached(q(req, 'supplier-distribution'), TTL, () =>
      analyticsService.getSupplierDistribution({
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
      })
    );
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取供应商分布失败');
  }
});

// GET /api/v1/analytics/category-distribution
router.get('/category-distribution', async (req: AuthRequest, res: Response) => {
  try {
    const data = await cached(q(req, 'category-distribution'), TTL, () =>
      analyticsService.getCategoryDistribution({
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
      })
    );
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取分类分布失败');
  }
});

// GET /api/v1/analytics/profit
router.get('/profit', async (req: AuthRequest, res: Response) => {
  try {
    const data = await cached(q(req, 'profit'), TTL, () =>
      analyticsService.getProfitSummary({
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
      })
    );
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取毛利汇总失败');
  }
});

// GET /api/v1/analytics/slow-movers
router.get('/slow-movers', async (req: AuthRequest, res: Response) => {
  try {
    const data = await cached(q(req, 'slow-movers'), TTL, () =>
      analyticsService.getSalesSlowMovers({
        days: parseBoundedInt(req.query.days, { defaultValue: 30, min: 1, max: 365 }),
        limit: parseBoundedInt(req.query.limit, { defaultValue: 20, min: 1, max: 100 }),
      })
    );
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取滞销分析失败');
  }
});

// GET /api/v1/analytics/reorder-suggestions
router.get('/reorder-suggestions', async (_req: AuthRequest, res: Response) => {
  try {
    const data = await cached('analytics:reorder', TTL, () =>
      analyticsService.getReorderSuggestions()
    );
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取补货建议失败');
  }
});

// GET /api/v1/analytics/alerts
router.get('/alerts', async (_req: AuthRequest, res: Response) => {
  try {
    const data = await cached('analytics:alerts', TTL, () =>
      analyticsService.getDashboardAlerts()
    );
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取告警数据失败');
  }
});

// GET /api/v1/analytics/search?q=xxx
router.get('/search', async (req: AuthRequest, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const limit = parseBoundedInt(req.query.limit, { defaultValue: 20, min: 1, max: 50 });
    const data = await analyticsService.globalSearch(query, limit);
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '搜索失败');
  }
});

export default router;
