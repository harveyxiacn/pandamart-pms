import { llmService } from './llm.service';
import { analyticsService } from './analytics.service';
import { batchService } from './batch.service';
import { knowledgeService } from './knowledge.service';
import db from '../config/database';
import { v4 as uuidv4 } from 'uuid';

// 内存中缓存对话上下文（生产环境可改用 Redis）。仅保存干净的文本轮次（system + user/assistant），
// 工具调用的中间消息只在单次请求内编排，不入库，避免跨轮 tool_call/tool 配对问题。
const conversations = new Map<string, { messages: any[]; lastAccessedAt: number }>();
const CONVERSATION_TTL_MS = 30 * 60 * 1000;
const MAX_CONVERSATIONS = 500; // 低内存 VPS 上限制内存占用

// 按"最后活跃时间"淘汰，避免把仍在进行的长对话在创建 30 分钟后误删
const conversationCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, conv] of conversations) {
    if (now - conv.lastAccessedAt > CONVERSATION_TTL_MS) {
      conversations.delete(id);
    }
  }
}, 5 * 60 * 1000);
conversationCleanupTimer.unref();

// 容量兜底：新会话写入前若超上限，淘汰最久未活跃的一条
function evictIfNeeded(incomingId: string): void {
  if (conversations.size < MAX_CONVERSATIONS || conversations.has(incomingId)) return;
  let oldestId: string | null = null;
  let oldest = Infinity;
  for (const [id, conv] of conversations) {
    if (conv.lastAccessedAt < oldest) {
      oldest = conv.lastAccessedAt;
      oldestId = id;
    }
  }
  if (oldestId) conversations.delete(oldestId);
}

const SYSTEM_PROMPT = `你是熊猫超市的智能经营助手，帮助店主分析库存、采购、销售与保质期数据。
你可以调用提供的工具实时查询数据库，再基于真实结果作答——不要编造数据。

回复要求：
1. 使用中文回答；金额用美元（$）表示
2. 先调用合适的工具获取数据，再给出具体数字、分析与可执行建议
3. 适当使用列表和**粗体**组织内容
4. 若工具返回为空，如实说明"暂无相关数据"，不要臆测`;

// ==================== 工具定义（function calling） ====================
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_low_stock',
      description: '查询当前低于安全库存的商品列表（缺货/补货相关问题用）',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_inventory',
      description: '按名称或SKU关键词查询商品的当前库存数量',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string', description: '商品名称或SKU关键词' } },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_price_changes',
      description: '查询采购进价波动最大的商品（最近两次确认采购的单价对比）',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回条数，默认10' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_purchase_ranking',
      description: '查询近 N 天采购量/金额排名的商品',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: '统计天数，默认30' },
          limit: { type: 'number', description: '返回条数，默认10' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_supplier_summary',
      description: '查询近 N 天各供应商的采购金额与发票数',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', description: '统计天数，默认30' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sales_summary',
      description: '查询近 N 天销售毛利汇总（营收、成本、毛利、毛利率、毛利贡献Top）',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', description: '统计天数，默认30' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_reorder_suggestions',
      description: '获取智能补货建议（基于安全库存与近期消耗）',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_expiring_batches',
      description: '查询 N 天内临期或已过期的商品批次（保质期/生鲜相关问题用）',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', description: '临期天数窗口，默认7' } },
        required: [],
      },
    },
  },
];

function daysAgoDate(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// ==================== 工具执行器 ====================
const toolExecutors: Record<string, (args: any) => Promise<any>> = {
  async get_low_stock() {
    const rows = await db('inventory')
      .select('products.name_en', 'products.name_zh', 'inventory.quantity', 'inventory.safe_stock', 'inventory.unit')
      .join('products', 'inventory.product_id', 'products.id')
      .whereNull('products.deleted_at')
      .whereNotNull('inventory.safe_stock')
      .whereRaw('inventory.quantity < inventory.safe_stock')
      .orderByRaw('(inventory.safe_stock - inventory.quantity) DESC')
      .limit(30);
    return rows.map((r: any) => ({
      name: `${r.name_en}${r.name_zh ? `(${r.name_zh})` : ''}`,
      quantity: Number(r.quantity),
      safeStock: Number(r.safe_stock),
      unit: r.unit,
    }));
  },

  async search_inventory(args: { keyword?: string }) {
    const kw = (args.keyword || '').trim();
    if (!kw) return [];
    const rows = await db('inventory')
      .select('products.name_en', 'products.name_zh', 'products.sku', 'inventory.quantity', 'inventory.unit', 'inventory.safe_stock')
      .join('products', 'inventory.product_id', 'products.id')
      .whereNull('products.deleted_at')
      .where(function () {
        this.where('products.name_en', 'like', `%${kw}%`)
          .orWhere('products.name_zh', 'like', `%${kw}%`)
          .orWhere('products.sku', 'like', `%${kw}%`);
      })
      .limit(20);
    return rows.map((r: any) => ({
      name: `${r.name_en}${r.name_zh ? `(${r.name_zh})` : ''}`,
      sku: r.sku,
      quantity: Number(r.quantity),
      unit: r.unit,
      safeStock: r.safe_stock != null ? Number(r.safe_stock) : null,
    }));
  },

  async get_price_changes(args: { limit?: number }) {
    // 复用 analytics 的价格波动统计，避免重复 SQL
    return analyticsService.getPriceChanges({ limit: Math.min(args.limit || 10, 30) });
  },

  async get_purchase_ranking(args: { days?: number; limit?: number }) {
    // 复用 analytics 的采购排名（按采购量 top_selling）
    return analyticsService.getProductRanking({
      type: 'top_selling',
      limit: Math.min(args.limit || 10, 30),
      dateFrom: daysAgoDate(args.days || 30),
    });
  },

  async get_supplier_summary(args: { days?: number }) {
    // 复用 analytics 的供应商采购分布
    return analyticsService.getSupplierDistribution({ dateFrom: daysAgoDate(args.days || 30) });
  },

  async get_sales_summary(args: { days?: number }) {
    const since = daysAgoDate(args.days || 30);
    return analyticsService.getProfitSummary({ dateFrom: since });
  },

  async get_reorder_suggestions() {
    const list = await analyticsService.getReorderSuggestions();
    return list.slice(0, 20);
  },

  async get_expiring_batches(args: { days?: number }) {
    return batchService.getExpiringSummary(args.days || 7);
  },
};

export const aiChatService = {
  async chat(
    message: string,
    conversationId: string | null,
    userId: number
  ): Promise<{ conversationId: string; reply: string; dataUsed: any }> {
    void userId;
    let convId = conversationId;
    let history: any[] = [];

    if (convId && conversations.has(convId)) {
      history = conversations.get(convId)!.messages;
    } else {
      convId = `conv_${uuidv4().substring(0, 8)}`;
      history = [{ role: 'system', content: SYSTEM_PROMPT }];
    }

    // 单次请求内的工作消息（含工具中间消息），不污染持久化历史。
    // 每轮把最新资料库快照注入 system prompt：既给模型一个可靠的"底稿"，
    // 又保留工具调用用于追问更细的数据；快照失败时静默退回纯工具模式。
    const knowledgeContext = await knowledgeService.getCompactContext();
    const systemMessage = {
      role: 'system',
      content: knowledgeContext
        ? `${SYSTEM_PROMPT}\n\n当前资料库快照（由系统实时整理，可作为回答底稿；工具返回更细数据时以工具为准）：\n${knowledgeContext}`
        : SYSTEM_PROMPT,
    };
    const working: any[] = [
      systemMessage,
      ...history.slice(1),
      { role: 'user', content: message },
    ];
    const usedTools: string[] = [];
    let reply = '';

    // 工具调用循环（最多 5 轮，防止失控）
    const MAX_ROUNDS = 5;
    for (let i = 0; i < MAX_ROUNDS; i++) {
      // 最后一轮强制不再调用工具，让模型基于已查到的数据直接作答，避免轮次耗尽后丢失结果
      const lastRound = i === MAX_ROUNDS - 1;
      const msg = await llmService.chatCompletionRaw('chat', working, {
        temperature: 0.4,
        maxTokens: 2048,
        tools: TOOLS,
        toolChoice: lastRound ? 'none' : 'auto',
      });
      if (!msg) break;
      working.push(msg);

      const toolCalls = msg.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const name = tc.function?.name;
          usedTools.push(name);
          let args: any = {};
          try {
            args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            args = {};
          }
          let result: any;
          try {
            const exec = toolExecutors[name];
            result = exec ? await exec(args) : { error: `未知工具: ${name}` };
          } catch (err: any) {
            result = { error: err?.message || String(err) };
          }
          working.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result).slice(0, 6000),
          });
        }
        continue; // 带着工具结果再问模型
      }

      reply = msg.content || '';
      break;
    }

    if (!reply) reply = '抱歉，我暂时无法生成回答，请重试或换个问法。';

    // 仅把干净的文本轮次写入持久化历史
    history.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
    if (history.length > 21) {
      history = [history[0], ...history.slice(-20)];
    }
    evictIfNeeded(convId);
    conversations.set(convId, { messages: history, lastAccessedAt: Date.now() });

    return {
      conversationId: convId,
      reply,
      dataUsed: {
        tools: [...new Set(usedTools)],
        tables: ['live-db', 'knowledge_snapshot'],
        dateRange: '近 30 天',
        recordCount: 0,
        knowledgeInjected: Boolean(knowledgeContext),
      },
    };
  },
};
