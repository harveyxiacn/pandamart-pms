import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { aiProviderTestLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validator';
import { AiProviderModel } from '../models/AiProvider';
import { AuditLogModel } from '../models/AuditLog';
import { llmService } from '../services/llm.service';
import { encrypt, decrypt, maskApiKey } from '../utils/crypto';
import { AuthRequest } from '../types';
import { sendSuccess, sendError } from '../utils/helpers';

const router = Router();
const ALLOWED_THINKING_EFFORTS = ['xhigh', 'high', 'medium', 'low'] as const;
const ALLOWED_PURPOSES = ['ocr', 'analysis', 'chat', 'all'] as const;

function badRequest(message: string): Error & { statusCode: number; code: string } {
  const err = new Error(message) as Error & { statusCode: number; code: string };
  err.statusCode = 400;
  err.code = 'BAD_REQUEST';
  return err;
}

function normalizeOptionalThinkingEffort(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!ALLOWED_THINKING_EFFORTS.includes(normalized as (typeof ALLOWED_THINKING_EFFORTS)[number])) {
    throw badRequest('thinkingEffort 必须是 xhigh/high/medium/low 之一');
  }
  return normalized;
}

function normalizeOptionalPurpose(value: unknown): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!ALLOWED_PURPOSES.includes(normalized as (typeof ALLOWED_PURPOSES)[number])) {
    throw badRequest('purpose 必须是 ocr/analysis/chat/all 之一');
  }
  return normalized;
}

function normalizeOptionalMaxTokens(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw badRequest('maxTokens 必须是正整数');
  }
  return Math.floor(parsed);
}

function normalizeOptionalTemperature(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw badRequest('temperature 必须在 0 到 2 之间');
  }
  return parsed;
}

// GET /api/v1/ai-providers
router.get('/', authenticate, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const providers = await AiProviderModel.findAll();
    const result = providers.map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.base_url,
      apiKeyMasked: maskApiKey(decrypt(p.api_key_encrypted)),
      model: p.model,
      thinkingEffort: p.thinking_effort,
      supportsVision: !!p.supports_vision,
      purpose: p.purpose,
      isActive: !!p.is_active,
      isDefault: !!p.is_default,
      maxTokens: p.max_tokens,
      temperature: Number(p.temperature),
      lastTestAt: p.last_test_at,
      lastTestSuccess: p.last_test_success,
      lastTestLatencyMs: p.last_test_latency_ms,
      notes: p.notes,
      createdAt: p.created_at,
    }));
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// POST /api/v1/ai-providers
router.post(
  '/',
  authenticate,
  adminOnly,
  validate([
    { field: 'name', required: true, type: 'string' },
    { field: 'baseUrl', required: true, type: 'string' },
    { field: 'apiKey', required: true, type: 'string' },
    { field: 'model', required: true, type: 'string' },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        name,
        baseUrl,
        apiKey,
        model,
        thinkingEffort,
        supportsVision,
        purpose,
        maxTokens,
        temperature,
        notes,
      } = req.body;
      const normalizedThinkingEffort = normalizeOptionalThinkingEffort(thinkingEffort);
      const normalizedPurpose = normalizeOptionalPurpose(purpose);
      const normalizedMaxTokens = normalizeOptionalMaxTokens(maxTokens);
      const normalizedTemperature = normalizeOptionalTemperature(temperature);

      const id = await AiProviderModel.create({
        name,
        base_url: baseUrl,
        api_key_encrypted: encrypt(apiKey),
        model,
        thinking_effort: normalizedThinkingEffort,
        supports_vision: supportsVision !== false,
        purpose: normalizedPurpose || 'all',
        max_tokens: normalizedMaxTokens || 32768,
        temperature: normalizedTemperature ?? 0.3,
        notes: notes || null,
      } as any);

      await AuditLogModel.create({
        user_id: req.user!.sub,
        action: 'create',
        entity_type: 'ai_provider',
        entity_id: id,
        details: JSON.stringify({ name, model }),
      });

    sendSuccess(res, { id }, 'AI 提供商创建成功', 201);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
}
);

// PUT /api/v1/ai-providers/:id
router.put('/:id', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!Number.isFinite(id)) {
      sendError(res, 400, 'BAD_REQUEST', '无效的 AI 提供商 ID');
      return;
    }
    const provider = await AiProviderModel.findById(id);
    if (!provider) {
      sendError(res, 404, 'NOT_FOUND', 'AI 提供商不存在');
      return;
    }

    const updateData: any = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.baseUrl !== undefined) updateData.base_url = req.body.baseUrl;
    if (req.body.apiKey && req.body.apiKey.trim()) updateData.api_key_encrypted = encrypt(req.body.apiKey);
    if (req.body.model !== undefined) updateData.model = req.body.model;
    if (req.body.thinkingEffort !== undefined) {
      updateData.thinking_effort = normalizeOptionalThinkingEffort(req.body.thinkingEffort);
    }
    if (req.body.supportsVision !== undefined) updateData.supports_vision = req.body.supportsVision;
    if (req.body.purpose !== undefined) {
      updateData.purpose = normalizeOptionalPurpose(req.body.purpose) || 'all';
    }
    if (req.body.isActive !== undefined) updateData.is_active = req.body.isActive;
    if (req.body.maxTokens !== undefined) {
      updateData.max_tokens = normalizeOptionalMaxTokens(req.body.maxTokens) || provider.max_tokens;
    }
    if (req.body.temperature !== undefined) {
      updateData.temperature = normalizeOptionalTemperature(req.body.temperature) ?? provider.temperature;
    }
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;

    await AiProviderModel.update(id, updateData);

    await AuditLogModel.create({
      user_id: req.user!.sub,
      action: 'update',
      entity_type: 'ai_provider',
      entity_id: id,
    });

    sendSuccess(res, null, 'AI 提供商更新成功');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// DELETE /api/v1/ai-providers/:id
router.delete('/:id', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!Number.isFinite(id)) {
      sendError(res, 400, 'BAD_REQUEST', '无效的 AI 提供商 ID');
      return;
    }
    const provider = await AiProviderModel.findById(id);
    if (!provider) {
      sendError(res, 404, 'NOT_FOUND', 'AI 提供商不存在');
      return;
    }

    await AiProviderModel.delete(id);
    await AuditLogModel.create({
      user_id: req.user!.sub,
      action: 'delete',
      entity_type: 'ai_provider',
      entity_id: id,
      details: JSON.stringify({ name: provider.name, model: provider.model }),
    });
    sendSuccess(res, null, 'AI 提供商已删除');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// PUT /api/v1/ai-providers/:id/set-default
router.put('/:id/set-default', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!Number.isFinite(id)) {
      sendError(res, 400, 'BAD_REQUEST', '无效的 AI 提供商 ID');
      return;
    }
    const provider = await AiProviderModel.findById(id);
    if (!provider) {
      sendError(res, 404, 'NOT_FOUND', 'AI 提供商不存在');
      return;
    }

    await AiProviderModel.setDefault(id);
    await AuditLogModel.create({
      user_id: req.user!.sub,
      action: 'set_default',
      entity_type: 'ai_provider',
      entity_id: id,
    });
    sendSuccess(res, null, '已设为默认提供商');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// POST /api/v1/ai-providers/:id/test
router.post(
  '/:id/test',
  authenticate,
  adminOnly,
  aiProviderTestLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      if (!Number.isFinite(id)) {
        sendError(res, 400, 'BAD_REQUEST', '无效的 AI 提供商 ID');
        return;
      }
      const provider = await AiProviderModel.findById(id);
      if (!provider) {
        sendError(res, 404, 'NOT_FOUND', 'AI 提供商不存在');
        return;
      }

      const config = {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.base_url,
        apiKey: decrypt(provider.api_key_encrypted),
        model: provider.model,
        thinkingEffort: provider.thinking_effort,
        supportsVision: !!provider.supports_vision,
        purpose: provider.purpose,
        isActive: !!provider.is_active,
        maxTokens: provider.max_tokens,
        temperature: Number(provider.temperature),
      };

      const result = await llmService.testConnection(config);

      await AiProviderModel.updateTestResult(id, result.success, result.latencyMs);

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
    }
  }
);

export default router;
