import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { aiLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validator';
import { assistantService } from '../services/assistant.service';
import { aiInsightService } from '../services/ai-insight.service';
import { AuthRequest } from '../types';
import { sendSuccess } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();
router.use(authenticate, adminOnly);

// POST /api/v1/ai/chat —— 统一入口：mode=local|llm|auto（缺省读系统设置，默认 local）
router.post(
  '/chat',
  aiLimiter,
  validate([
    { field: 'message', required: true, type: 'string', minLength: 1, maxLength: 2000 },
    { field: 'mode', required: false, type: 'string', enum: ['local', 'llm', 'auto'] },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { message, conversationId, mode } = req.body;
      const result = await assistantService.chat(
        message,
        conversationId || null,
        req.user!.sub,
        mode
      );
      sendSuccess(res, result);
    } catch (err: any) {
      sendRouteError(res, err, '智能助手暂不可用');
    }
  }
);

// GET /api/v1/ai/status —— 当前模式、LLM 是否已配置（不暴露密钥）
router.get('/status', aiLimiter, async (_req: AuthRequest, res: Response) => {
  try {
    sendSuccess(res, await assistantService.getStatus());
  } catch (err: any) {
    sendRouteError(res, err, '无法读取智能助手状态');
  }
});

// GET /api/v1/ai/knowledge?refresh=1 —— 整理后的资料库快照 + 预警
router.get('/knowledge', aiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    sendSuccess(res, await assistantService.getKnowledge(force));
  } catch (err: any) {
    sendRouteError(res, err, '资料库整理失败');
  }
});

// GET /api/v1/ai/alerts —— 仅库存/经营预警
router.get('/alerts', aiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    sendSuccess(res, await assistantService.getAlerts(force));
  } catch (err: any) {
    sendRouteError(res, err, '预警生成失败');
  }
});

// GET /api/v1/ai/report?period=week|month —— 本地规则生成的经营简报（无需 LLM）
router.get('/report', aiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const period = req.query.period === 'month' ? 'month' : 'week';
    sendSuccess(res, await assistantService.getReport(period));
  } catch (err: any) {
    sendRouteError(res, err, '生成经营简报失败');
  }
});

// POST /api/v1/ai/reorder-advice —— LLM 增强的补货建议（保留兼容）
router.post(
  '/reorder-advice',
  aiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await aiInsightService.getReorderAdvice(
        req.body.categoryId,
        req.body.context
      );
      sendSuccess(res, data);
    } catch (err: any) {
      sendRouteError(res, err);
    }
  }
);

// GET /api/v1/ai/insights —— LLM 增强的经营洞察（保留兼容）
router.get('/insights', aiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const data = await aiInsightService.getInsights(req.query.period as string);
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

export default router;
