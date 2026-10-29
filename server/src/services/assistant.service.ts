/**
 * 智能助手编排层。
 *
 * 两种引擎：
 *   - local：本地资料库 + 规则引擎，零外部依赖，默认模式；
 *   - llm  ：原有 function-calling 代理，需要管理员在「系统设置」配置 AI 提供商。
 * auto 模式在配置了 LLM 时走 LLM，否则走本地。
 *
 * 任何 LLM 调用的失败（未配置/超时/限流/返回格式异常）都会自动降级到本地引擎，
 * 保证「智能助手」在离线 VPS 上仍然可用。
 */
import { AiProviderModel } from '../models/AiProvider';
import { SettingModel } from '../models/Setting';
import { aiChatService } from './ai-chat.service';
import { knowledgeService } from './knowledge.service';
import { composeAnswer, parseIntent, type AssistantSnapshot } from './assistant-engine';
import logger from '../utils/logger';

export type AssistantMode = 'local' | 'llm' | 'auto';

export interface AssistantChatResult {
  conversationId: string;
  reply: string;
  engine: 'local' | 'llm';
  mode: AssistantMode;
  llmConfigured: boolean;
  intent?: string;
  confidence?: number;
  windowDays?: number;
  suggestions?: string[];
  sources?: string[];
  snapshotAt?: string;
  alertsCount?: number;
  fallback?: { from: 'llm'; reason: string };
  dataUsed: {
    tools: string[];
    tables: string[];
    dateRange: string;
    recordCount: number;
  };
}

const MODES: AssistantMode[] = ['local', 'llm', 'auto'];

export function normalizeMode(value: unknown): AssistantMode | null {
  return typeof value === 'string' && (MODES as string[]).includes(value)
    ? (value as AssistantMode)
    : null;
}

async function configuredMode(): Promise<AssistantMode> {
  const stored = await SettingModel.get('assistant_mode').catch(() => null);
  return normalizeMode(stored) || 'local';
}

async function llmProvider(): Promise<{ name: string; model: string } | null> {
  try {
    const provider = await AiProviderModel.findByPurpose('chat');
    return provider ? { name: provider.name, model: provider.model } : null;
  } catch {
    return null;
  }
}

function localConversationId(conversationId: string | null): string {
  if (conversationId) return conversationId;
  return `local_${Date.now().toString(36)}`;
}

function recordCount(snapshot: AssistantSnapshot): number {
  return (
    snapshot.inventory.productCount +
    snapshot.expiring.items.length +
    snapshot.purchase.topSuppliers.reduce((sum, item) => sum + item.invoiceCount, 0)
  );
}

async function localAnswer(
  message: string,
  conversationId: string | null,
  mode: AssistantMode,
  llmConfigured: boolean
): Promise<AssistantChatResult> {
  const snapshot = await knowledgeService.getSnapshot();
  const intent = parseIntent(message, snapshot.inventory.products);
  const answer = composeAnswer(intent, snapshot);

  return {
    conversationId: localConversationId(conversationId),
    reply: answer.reply,
    engine: 'local',
    mode,
    llmConfigured,
    intent: answer.intent,
    confidence: answer.confidence,
    windowDays: answer.windowDays,
    suggestions: answer.suggestions,
    sources: answer.sources,
    snapshotAt: snapshot.generatedAt,
    alertsCount: snapshot.inventory.lowStockCount + snapshot.expiring.expiredCount,
    dataUsed: {
      tools: [],
      tables: answer.sources,
      dateRange: `近 ${answer.windowDays} 天`,
      recordCount: recordCount(snapshot),
    },
  };
}

export const assistantService = {
  async getStatus(): Promise<{
    mode: AssistantMode;
    llmConfigured: boolean;
    provider: { name: string; model: string } | null;
    localReady: boolean;
    snapshotTtlSeconds: number;
  }> {
    const [mode, provider] = await Promise.all([configuredMode(), llmProvider()]);
    return {
      mode,
      llmConfigured: Boolean(provider),
      provider,
      localReady: true,
      snapshotTtlSeconds: 60,
    };
  },

  async chat(
    message: string,
    conversationId: string | null,
    userId: number,
    requestedMode?: unknown
  ): Promise<AssistantChatResult> {
    const mode = normalizeMode(requestedMode) || (await configuredMode());
    const provider = await llmProvider();
    const llmConfigured = Boolean(provider);

    if (mode === 'local' || (mode === 'auto' && !llmConfigured)) {
      return localAnswer(message, conversationId, mode, llmConfigured);
    }

    try {
      const result = await aiChatService.chat(message, conversationId, userId);
      return {
        conversationId: result.conversationId,
        reply: result.reply,
        engine: 'llm',
        mode,
        llmConfigured,
        dataUsed: {
          tools: result.dataUsed?.tools || [],
          tables: result.dataUsed?.tables || ['live-db'],
          dateRange: result.dataUsed?.dateRange || '近 30 天',
          recordCount: result.dataUsed?.recordCount || 0,
        },
      };
    } catch (err: any) {
      const reason = err?.message || String(err);
      logger.warn(`LLM 助手调用失败，降级到本地资料库引擎：${reason}`);
      const fallback = await localAnswer(message, conversationId, mode, llmConfigured);
      return {
        ...fallback,
        fallback: { from: 'llm', reason },
      };
    }
  },

  getKnowledge: knowledgeService.getKnowledge.bind(knowledgeService),
  getAlerts: knowledgeService.getAlerts.bind(knowledgeService),
  getReport: knowledgeService.getReport.bind(knowledgeService),
};
