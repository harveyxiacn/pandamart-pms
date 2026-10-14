import { llmService } from './llm.service';
import { analyticsService } from './analytics.service';
import db from '../config/database';
import logger from '../utils/logger';

export const aiInsightService = {
  async getInsights(period: string = 'week'): Promise<any> {
    // 收集分析数据
    const now = new Date();
    let periodStart: Date;

    if (period === 'month') {
      periodStart = new Date(now);
      periodStart.setMonth(periodStart.getMonth() - 1);
    } else {
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 7);
    }

    const dateFrom = periodStart.toISOString().split('T')[0];
    const dateTo = now.toISOString().split('T')[0];
    const periodLabel = `${dateFrom} ~ ${dateTo}`;

    // 收集上下文数据
    const contextParts: string[] = [];

    // 采购总额
    const purchaseStats = await db('invoices')
      .where('status', 'confirmed')
      .where('invoice_date', '>=', dateFrom)
      .where('invoice_date', '<=', dateTo)
      .select(
        db.raw('COUNT(*) as invoiceCount'),
        db.raw('COALESCE(SUM(grand_total), 0) as totalAmount')
      )
      .first();

    contextParts.push(`本期采购：${purchaseStats?.invoiceCount || 0}张发票，总额 $${Number(purchaseStats?.totalAmount || 0).toFixed(2)}`);

    // 上期对比
    const prevStart = new Date(periodStart);
    const prevEnd = new Date(periodStart);
    if (period === 'month') {
      prevStart.setMonth(prevStart.getMonth() - 1);
    } else {
      prevStart.setDate(prevStart.getDate() - 7);
    }

    const prevStats = await db('invoices')
      .where('status', 'confirmed')
      .where('invoice_date', '>=', prevStart.toISOString().split('T')[0])
      .where('invoice_date', '<', dateFrom)
      .select(db.raw('COALESCE(SUM(grand_total), 0) as totalAmount'))
      .first();

    const prevAmount = Number(prevStats?.totalAmount || 0);
    const currAmount = Number(purchaseStats?.totalAmount || 0);
    if (prevAmount > 0) {
      const changePercent = ((currAmount - prevAmount) / prevAmount * 100).toFixed(1);
      contextParts.push(`较上期${Number(changePercent) >= 0 ? '增长' : '下降'} ${Math.abs(Number(changePercent))}%`);
    }

    // 价格波动
    const priceChanges = await analyticsService.getPriceChanges({ threshold: 5, dateFrom, dateTo, limit: 10 });
    if (priceChanges.length > 0) {
      contextParts.push('价格波动产品：\n' + priceChanges.map((p: any) =>
        `- ${p.nameEn}${p.nameZh ? `(${p.nameZh})` : ''}: $${p.previousPrice} → $${p.currentPrice} (${p.changePercent > 0 ? '+' : ''}${p.changePercent}%)`
      ).join('\n'));
    }

    // 低库存
    const lowStock = await db('inventory')
      .select('products.name_en', 'products.name_zh', 'inventory.quantity', 'inventory.safe_stock', 'inventory.unit')
      .join('products', 'inventory.product_id', 'products.id')
      .whereNull('products.deleted_at')
      .whereNotNull('inventory.safe_stock')
      .whereRaw('inventory.quantity < inventory.safe_stock')
      .limit(10);

    if (lowStock.length > 0) {
      contextParts.push('低库存产品：\n' + lowStock.map((r: any) =>
        `- ${r.name_en}${r.name_zh ? `(${r.name_zh})` : ''}: ${r.quantity}/${r.safe_stock} ${r.unit}`
      ).join('\n'));
    }

    // 供应商占比
    const supplierDist = await analyticsService.getSupplierDistribution({ dateFrom, dateTo });
    if (supplierDist.length > 0) {
      contextParts.push('供应商采购占比：\n' + supplierDist.slice(0, 5).map((s: any) =>
        `- ${s.supplierName}: $${s.totalAmount.toFixed(2)} (${s.percentage}%)`
      ).join('\n'));
    }

    // 调用 LLM 生成洞察
    const prompt = `你是熊猫超市的经营分析助手。请根据以下数据生成一份简洁的${period === 'month' ? '月度' : '周度'}经营洞察报告。

数据时段：${periodLabel}

${contextParts.join('\n\n')}

请按以下格式输出：
1. 一段总结性描述（2-3句话）
2. 需要关注的异常或风险点（列表形式，每条包含类型标签如 price_spike / stockout_risk / cost_increase）

输出JSON格式：
{
  "summary": "总结描述",
  "alerts": [
    { "type": "price_spike", "message": "具体描述" }
  ]
}

仅返回JSON，不要包含其他文字。`;

    try {
      const response = await llmService.chatCompletion('analysis', [
        { role: 'user', content: prompt },
      ], { temperature: 0.4, maxTokens: 1024 });

      let jsonStr = response.trim();
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();

      const result = JSON.parse(jsonStr);

      return {
        period: periodLabel,
        summary: result.summary || '暂无足够数据生成洞察报告',
        alerts: result.alerts || [],
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.error('AI 洞察生成失败:', err);
      return {
        period: periodLabel,
        summary: `本期采购总额 $${currAmount.toFixed(2)}，共 ${purchaseStats?.invoiceCount || 0} 张发票。${lowStock.length > 0 ? `有 ${lowStock.length} 个产品库存低于安全线。` : ''}`,
        alerts: lowStock.map((r: any) => ({
          type: 'stockout_risk',
          message: `${r.name_en} 库存仅剩 ${r.quantity} ${r.unit}`,
        })),
        generatedAt: new Date().toISOString(),
      };
    }
  },

  async getReorderAdvice(categoryId?: number, context?: string): Promise<any> {
    // 获取需要补货的产品
    const suggestions = await analyticsService.getReorderSuggestions();
    // categoryId 可能以字符串传入（JSON 体/表单），统一按数值比较，避免 === 恒不相等导致过滤后恒为空
    const wantedCategory = categoryId != null && categoryId !== ('' as any) ? Number(categoryId) : null;
    const filtered =
      wantedCategory != null && Number.isFinite(wantedCategory)
        ? suggestions.filter((s: any) => s.categoryId != null && Number(s.categoryId) === wantedCategory)
        : suggestions;

    if (filtered.length === 0) {
      return {
        advice: '当前没有需要补货的产品。',
        suggestedItems: [],
      };
    }

    const dataStr = filtered.map((s: any) =>
      `- ${s.nameEn}${s.nameZh ? `(${s.nameZh})` : ''}: 当前 ${s.currentStock}, 安全线 ${s.safeStock}, 周均消耗 ${s.avgWeeklyUsage}, 上次单价 $${s.lastPrice}, 建议采购 ${s.suggestedQuantity}`
    ).join('\n');

    const prompt = `你是熊猫超市的智能订货助手。请根据以下库存数据生成订货建议。

${context ? `额外上下文：${context}\n` : ''}
需要补货的产品：
${dataStr}

请给出：
1. 整体建议（考虑额外上下文如节假日等因素）
2. 具体每个产品的建议采购量和理由

用中文自然语言回复，适当使用粗体和列表。`;

    try {
      const advice = await llmService.chatCompletion('analysis', [
        { role: 'user', content: prompt },
      ], { temperature: 0.5, maxTokens: 1500 });

      return {
        advice,
        suggestedItems: filtered.map((s: any) => ({
          productId: s.productId,
          nameZh: s.nameZh,
          suggestedQty: s.suggestedQuantity,
          normalQty: Math.ceil(s.avgWeeklyUsage),
          reason: s.urgency === 'high' ? '紧急补货' : '常规补货',
        })),
      };
    } catch (err) {
      logger.error('AI 订货建议生成失败:', err);
      return {
        advice: 'AI 服务暂不可用，以下是基于统计数据的建议：\n\n' + filtered.map((s: any) =>
          `- **${s.nameEn}**: 建议采购 ${s.suggestedQuantity} ${s.unit || '件'}（当前 ${s.currentStock}，安全线 ${s.safeStock}）`
        ).join('\n'),
        suggestedItems: filtered.map((s: any) => ({
          productId: s.productId,
          nameZh: s.nameZh,
          suggestedQty: s.suggestedQuantity,
          normalQty: Math.ceil(s.avgWeeklyUsage),
          reason: s.urgency === 'high' ? '紧急补货' : '常规补货',
        })),
      };
    }
  },
};
