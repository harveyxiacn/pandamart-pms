import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { analyticsService } from '../services/analytics.service';
import { AuthRequest } from '../types';
import { sendSuccess } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();
router.use(authenticate, adminOnly);

// GET /api/v1/analytics/dashboard
router.get('/dashboard', async (_req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getDashboard();
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取仪表盘数据失败');
  }
});

// GET /api/v1/analytics/purchase-trend
router.get('/purchase-trend', async (req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getPurchaseTrend({
      period: req.query.period as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    });
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取采购趋势失败');
  }
});

// GET /api/v1/analytics/product-ranking
router.get('/product-ranking', async (req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getProductRanking({
      type: req.query.type as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
    });
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取商品排行失败');
  }
});

// GET /api/v1/analytics/price-changes
router.get('/price-changes', async (req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getPriceChanges({
      threshold: req.query.threshold ? parseFloat(req.query.threshold as string) : undefined,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取价格波动失败');
  }
});

// GET /api/v1/analytics/supplier-distribution
router.get('/supplier-distribution', async (req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getSupplierDistribution({
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    });
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取供应商分布失败');
  }
});

// GET /api/v1/analytics/category-distribution
router.get('/category-distribution', async (req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getCategoryDistribution({
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    });
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取分类分布失败');
  }
});

// GET /api/v1/analytics/profit
router.get('/profit', async (req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getProfitSummary({
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    });
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取毛利汇总失败');
  }
});

// GET /api/v1/analytics/slow-movers
router.get('/slow-movers', async (req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getSalesSlowMovers({
      days: req.query.days ? parseInt(req.query.days as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取滞销分析失败');
  }
});

// GET /api/v1/analytics/reorder-suggestions
router.get('/reorder-suggestions', async (_req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getReorderSuggestions();
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err, '获取补货建议失败');
  }
});

export default router;
