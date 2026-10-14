import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { aiLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validator';
import { aiChatService } from '../services/ai-chat.service';
import { aiInsightService } from '../services/ai-insight.service';
import { AuthRequest } from '../types';
import { sendSuccess } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();
router.use(authenticate, adminOnly);

// POST /api/v1/ai/chat
router.post(
  '/chat',
  aiLimiter,
  validate([{ field: 'message', required: true, type: 'string', minLength: 1 }]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { message, conversationId } = req.body;
      const result = await aiChatService.chat(message, conversationId || null, req.user!.sub);
      sendSuccess(res, result);
    } catch (err: any) {
      sendRouteError(res, err, 'AI 对话服务暂不可用');
    }
  }
);

// POST /api/v1/ai/reorder-advice
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

// GET /api/v1/ai/insights
router.get('/insights', aiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const data = await aiInsightService.getInsights(req.query.period as string);
    sendSuccess(res, data);
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

export default router;
