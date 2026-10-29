/**
 * 本地智能助手引擎（无 LLM）。
 *
 * 设计目标：在完全离线/未配置任何 AI 提供商的情况下，仍然能基于数据库中的
 * 最新仓库、销售、采购、批次与应付数据回答常见经营问题，并生成库存预警。
 *
 * 分层：
 *   knowledge.service.ts 负责把实时数据库整理成结构化「资料库快照」；
 *   本文件只做纯逻辑：意图识别、快照取数、答案编排、预警规则与资料库摘要。
 * 因此这里不依赖数据库连接，可以直接用单元测试覆盖（见 assistant-engine.test.ts）。
 */

export type AssistantWindowKey = 1 | 7 | 30 | 90;

export interface ProductIndexItem {
  productId: number;
  nameEn: string;
  nameZh: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  safeStock: number | null;
  unit: string;
  supplierName: string | null;
  defaultPrice: number | null;
  sellingPrice: number | null;
}

export interface LowStockItem {
  productId: number;
  nameEn: string;
  nameZh: string | null;
  sku: string | null;
  quantity: number;
  safeStock: number;
  unit: string;
  deficit: number;
  supplierName: string | null;
  urgency: 'high' | 'medium' | 'low';
}

export interface ReorderItem extends LowStockItem {
  avgWeeklyUsage: number;
  suggestedQuantity: number;
  estimatedCost: number;
  lastPrice: number;
}

export interface ExpiringItem {
  productId: number;
  nameEn: string;
  nameZh: string | null;
  batchNo: string | null;
  expiryDate: string;
  quantity: number;
  expired: boolean;
}

export interface PriceChangeItem {
  productId: number;
  nameEn: string;
  nameZh: string | null;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
  supplierName: string | null;
}

export interface TopProductItem {
  productId: number;
  nameEn: string;
  nameZh: string | null;
  revenue: number;
  profit: number;
  qty: number;
}

export interface PurchaseProductItem {
  productId: number;
  nameEn: string;
  nameZh: string | null;
  totalQuantity: number;
  totalAmount: number;
  avgPrice: number;
}

export interface SlowMoverItem {
  productId: number;
  nameEn: string;
  nameZh: string | null;
  currentStock: number;
  soldQty: number;
}

export interface PayableItem {
  supplierId: number;
  supplierName: string;
  outstanding: number;
  invoiceCount: number;
  lastInvoiceDate: string | null;
}

export interface SupplierPurchaseItem {
  supplierId: number;
  supplierName: string;
  totalAmount: number;
  invoiceCount: number;
}

export interface WindowMetrics {
  days: AssistantWindowKey;
  sales: {
    revenue: number;
    cost: number;
    grossProfit: number;
    margin: number;
    orderCount: number;
  };
  purchase: {
    totalAmount: number;
    invoiceCount: number;
  };
}

export interface AssistantSnapshot {
  generatedAt: string;
  source: 'live-db';
  inventory: {
    productCount: number;
    totalUnits: number;
    lowStockCount: number;
    zeroStockCount: number;
    stockValueCost: number;
    stockValueRetail: number;
    lowStock: LowStockItem[];
    products: ProductIndexItem[];
  };
  windows: WindowMetrics[];
  sales: {
    topProducts: TopProductItem[];
    slowMovers: SlowMoverItem[];
    slowMoverDays: number;
  };
  purchase: {
    pendingCount: number;
    pendingOverdueCount: number;
    topSuppliers: SupplierPurchaseItem[];
    topProducts: PurchaseProductItem[];
    priceChanges: PriceChangeItem[];
    priceThreshold: number;
  };
  expiring: {
    days: number;
    expiredCount: number;
    expiringCount: number;
    items: ExpiringItem[];
  };
  reorder: ReorderItem[];
  payables: {
    totalOutstanding: number;
    count: number;
    items: PayableItem[];
  };
}

export type AssistantAlertType =
  | 'stockout_risk'
  | 'price_spike'
  | 'pending_invoice'
  | 'expiring_batch'
  | 'slow_mover'
  | 'payables';

export type AssistantAlertSeverity = 'high' | 'medium' | 'low';

export interface AssistantAlert {
  id: string;
  type: AssistantAlertType;
  severity: AssistantAlertSeverity;
  title: string;
  message: string;
  link: string;
  count?: number;
}

export type AssistantIntentName =
  | 'greeting'
  | 'help'
  | 'overview'
  | 'alerts'
  | 'low_stock'
  | 'reorder'
  | 'expiring'
  | 'sales'
  | 'profit'
  | 'purchase'
  | 'price_change'
  | 'supplier'
  | 'payables'
  | 'slow_mover'
  | 'pending_invoice'
  | 'product_lookup'
  | 'unknown';

export interface AssistantIntent {
  name: AssistantIntentName;
  days: number;
  window: AssistantWindowKey;
  keyword?: string;
  product?: ProductIndexItem;
  confidence: number;
}

export interface LocalAnswer {
  reply: string;
  intent: AssistantIntentName;
  confidence: number;
  windowDays: number;
  suggestions: string[];
  sources: string[];
}

export interface LocalReport {
  period: 'week' | 'month';
  summary: string;
  alerts: Array<{ type: string; message: string }>;
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* 格式化                                                              */
/* ------------------------------------------------------------------ */

export function formatMoney(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return `$${rounded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatQty(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toLocaleString('en-US') : rounded.toFixed(2);
}

export function formatPercent(value: number): string {
  return `${(Math.round((Number(value) || 0) * 10) / 10).toFixed(1)}%`;
}

export function productLabel(item: {
  nameEn: string;
  nameZh?: string | null;
}): string {
  if (item.nameZh && item.nameEn && item.nameZh !== item.nameEn) {
    return `${item.nameZh}（${item.nameEn}）`;
  }
  return item.nameZh || item.nameEn;
}

export function dateKey(value: string | Date = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function formatLocalDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${dateKey(d)} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

/* ------------------------------------------------------------------ */
/* 意图识别                                                            */
/* ------------------------------------------------------------------ */

const WINDOW_KEYS: AssistantWindowKey[] = [1, 7, 30, 90];

export function pickWindow(days: number): AssistantWindowKey {
  let picked: AssistantWindowKey = 1;
  for (const key of WINDOW_KEYS) {
    if (days >= key) picked = key;
  }
  return picked;
}

export function parseDays(message: string, now = new Date()): number {
  const text = message.toLowerCase();

  const explicit = text.match(/(?:最近|近|过去|前)\s*(\d{1,3})\s*(?:个)?(?:天|日|days?)/);
  if (explicit) {
    const n = Number(explicit[1]);
    if (n > 0) return Math.min(365, n);
  }
  const english = text.match(/(?:last|past)\s*(\d{1,3})\s*days?/);
  if (english) return Math.min(365, Math.max(1, Number(english[1])));

  if (/今天|今日|当天|today/.test(text)) return 1;
  if (/昨天|昨日|yesterday/.test(text)) return 2;
  if (/本周|这周|本星期|this week/.test(text)) {
    const diff = Math.floor((now.getTime() - startOfWeek(now).getTime()) / 86400000) + 1;
    return Math.max(1, diff);
  }
  if (/上周|上星期|last week/.test(text)) return 14;
  if (/本月|这个月|当月|this month/.test(text)) {
    return Math.max(1, now.getDate());
  }
  if (/上月|上个月|last month/.test(text)) return 60;
  if (/季度|quarter/.test(text)) return 90;
  if (/半年|half year/.test(text)) return 180;
  if (/一年|全年|year/.test(text)) return 365;
  return 30;
}

const PRODUCT_STOPWORDS = new Set([
  '商品',
  '产品',
  '库存',
  '销售',
  '采购',
  '供应商',
  '发票',
  '批次',
  '价格',
  '毛利',
  '利润',
  '还有',
  '多少',
  '剩余',
  '剩下',
  '现在',
  '最近',
  '今天',
  '本周',
  '本月',
  '怎么',
  '怎么样',
  '如何',
  '哪些',
  '哪个',
  '什么',
  '需要',
  '补货',
  '可以',
  '帮我',
  '一下',
  '还有多少',
  '低库存',
  '安全库存',
  '临期',
  '过期',
  '滞销',
  '涨价',
  '降价',
  '应付',
  '欠款',
  '经营',
  '情况',
]);

// 中文没有空格，模糊匹配用 2~6 字 n-gram 反查商品名：例如「苹果」命中「红富士苹果」。
// 优先精确包含，其次才用 n-gram，且只选择得分最高的一个商品，避免把问题答成商品清单。
function fuzzyTokens(message: string): string[] {
  const tokens = new Set<string>();
  const cleaned = message
    .toLowerCase()
    .replace(/[，。！？、,.!?;；:："“”'‘’()（）[\]【】\s]/g, ' ');

  for (const word of cleaned.match(/[a-z0-9][a-z0-9-]{2,}/g) || []) {
    tokens.add(word);
  }

  for (const chunk of cleaned.match(/[一-龥]{2,}/g) || []) {
    const maxLength = Math.min(6, chunk.length);
    for (let length = maxLength; length >= 2; length--) {
      for (let start = 0; start + length <= chunk.length; start++) {
        tokens.add(chunk.slice(start, start + length));
      }
    }
  }

  return Array.from(tokens).filter((token) => !PRODUCT_STOPWORDS.has(token));
}

function matchProduct(message: string, products: ProductIndexItem[]): ProductIndexItem | undefined {
  const text = message.toLowerCase();
  const quoted = message.match(/["“'‘]([^"”'’]{2,60})["”'’]/)?.[1]?.toLowerCase();
  const tokens = fuzzyTokens(message);
  let best: ProductIndexItem | undefined;
  let bestScore = 0;

  for (const product of products) {
    const candidates: string[] = [];
    if (product.nameZh && product.nameZh.trim().length >= 2) {
      candidates.push(product.nameZh.trim().toLowerCase());
    }
    if (product.nameEn && product.nameEn.trim().length >= 3) {
      candidates.push(product.nameEn.trim().toLowerCase());
    }
    if (product.sku && product.sku.trim().length >= 2) {
      candidates.push(product.sku.trim().toLowerCase());
    }
    if (product.barcode && product.barcode.trim().length >= 4) {
      candidates.push(product.barcode.trim().toLowerCase());
    }

    for (const candidate of candidates) {
      if (candidate.length < 2 || PRODUCT_STOPWORDS.has(candidate)) continue;

      let score = 0;
      if (quoted && candidate.includes(quoted)) {
        score = 2000 + quoted.length;
      } else if (text.includes(candidate)) {
        score = 1500 + candidate.length;
      } else {
        for (const token of tokens) {
          if (token.length >= 2 && candidate.includes(token)) {
            // 更长的匹配词优先；同长度时偏好更短的完整商品名（更具体）
            const tokenScore =
              500 + token.length * 10 - Math.abs(candidate.length - token.length) * 0.1;
            if (tokenScore > score) score = tokenScore;
          }
        }
      }

      if (score > bestScore) {
        best = product;
        bestScore = score;
      }
    }
  }

  return bestScore > 0 ? best : undefined;
}

export function parseIntent(
  message: string,
  products: ProductIndexItem[] = [],
  now = new Date()
): AssistantIntent {
  const raw = String(message || '').trim();
  const text = raw.toLowerCase();
  const days = parseDays(raw, now);
  const window = pickWindow(days);
  const product = matchProduct(raw, products);
  const keyword = product
    ? product.nameZh || product.nameEn
    : raw.match(/["“'‘]([^"”'’]{2,60})["”'’]/)?.[1];

  const intent = (
    name: AssistantIntentName,
    confidence: number
  ): AssistantIntent => ({ name, days, window, product, keyword, confidence });

  if (!text) return intent('unknown', 0);

  if (/^(你好|您好|嗨|哈喽|hello|hi|hey)[!！。.?\s]*$/.test(text)) {
    return intent('greeting', 0.95);
  }
  if (/能做什么|你会什么|怎么用|使用说明|帮助|help|what can you do/.test(text)) {
    return intent('help', 0.9);
  }

  const strong: Array<[AssistantIntentName, RegExp, number]> = [
    [
      'expiring',
      /临期|过期|到期|保质期|效期|expir|best before|shelf life/,
      0.95,
    ],
    ['alerts', /预警|告警|风险|异常|需要关注|该注意|alert|warning|risk/, 0.9],
    ['payables', /应付|欠款|还欠|欠多少|未付|未结|账款|欠供应商|payable|owed|outstanding/, 0.95],
    [
      'price_change',
      /涨价|降价|价格波动|价格变化|进价|采购价|成本上涨|成本下降|price change|price spike|cost increase/,
      0.92,
    ],
    ['slow_mover', /滞销|卖不动|不动销|销量低|slow.?mov/, 0.9],
    ['profit', /毛利|利润|赚了多少|盈利|profit|margin|gross/, 0.92],
    ['sales', /销售|营业额|营收|收入|流水|卖了多少|sales|revenue|turnover/, 0.9],
    ['supplier', /供应商|supplier|vendor/, 0.88],
    ['pending_invoice', /发票|待审核|待确认|invoice|pending/, 0.85],
    ['reorder', /补货|订货|进货建议|该进什么|买什么|reorder|restock|what.*buy/, 0.93],
    [
      'low_stock',
      /缺货|断货|库存不足|低于安全|安全库存|库存预警|low stock|stockout|out of stock/,
      0.93,
    ],
    ['purchase', /采购|进货|买入|purchase|spend/, 0.82],
    ['overview', /库存|仓库|概览|总体|经营情况|经营状况|overview|summary|dashboard/, 0.7],
  ];

  for (const [name, pattern, confidence] of strong) {
    if (pattern.test(text)) {
      // 命中商品且问题只是在问「库存/多少」时，转为单品查询，避免只给整店概览
      if (
        product &&
        (name === 'overview' || name === 'low_stock') &&
        /还有多少|剩多少|有多少|够不够|库存|在哪|查一下|看看/.test(text)
      ) {
        return intent('product_lookup', 0.9);
      }
      return intent(name, confidence);
    }
  }

  if (product) return intent('product_lookup', 0.85);
  return intent('unknown', 0);
}

/* ------------------------------------------------------------------ */
/* 预警规则                                                            */
/* ------------------------------------------------------------------ */

export function deriveAlerts(snapshot: AssistantSnapshot): AssistantAlert[] {
  const alerts: AssistantAlert[] = [];
  const { inventory, expiring, purchase, payables, sales } = snapshot;

  if (inventory.lowStockCount > 0) {
    alerts.push({
      id: 'low-stock',
      type: 'stockout_risk',
      severity: inventory.zeroStockCount > 0 ? 'high' : 'medium',
      title: '库存不足',
      message:
        inventory.zeroStockCount > 0
          ? `${inventory.lowStockCount} 个商品低于安全库存，其中 ${inventory.zeroStockCount} 个已缺货`
          : `${inventory.lowStockCount} 个商品低于安全库存，请及时补货`,
      link: '/inventory',
      count: inventory.lowStockCount,
    });
  }

  if (expiring.expiredCount > 0) {
    alerts.push({
      id: 'expired-batches',
      type: 'expiring_batch',
      severity: 'high',
      title: '过期批次',
      message: `${expiring.expiredCount} 个批次已过期，请尽快下架并报损`,
      link: '/batches',
      count: expiring.expiredCount,
    });
  }
  if (expiring.expiringCount > 0) {
    alerts.push({
      id: 'expiring-batches',
      type: 'expiring_batch',
      severity: expiring.expiringCount > 3 ? 'medium' : 'low',
      title: '临期批次',
      message: `${expiring.expiringCount} 个批次将在 ${expiring.days} 天内到期`,
      link: '/batches',
      count: expiring.expiringCount,
    });
  }

  if (purchase.pendingCount > 0) {
    alerts.push({
      id: 'pending-invoices',
      type: 'pending_invoice',
      severity: purchase.pendingOverdueCount > 0 ? 'high' : 'medium',
      title: '待处理发票',
      message:
        purchase.pendingOverdueCount > 0
          ? `${purchase.pendingCount} 张发票待确认，其中 ${purchase.pendingOverdueCount} 张已超过 3 天`
          : `${purchase.pendingCount} 张发票等待确认入库`,
      link: '/invoices?status=pending',
      count: purchase.pendingCount,
    });
  }

  const increases = purchase.priceChanges.filter((item) => item.changePercent > 0);
  if (increases.length > 0) {
    const max = Math.max(...increases.map((item) => item.changePercent));
    alerts.push({
      id: 'price-increase',
      type: 'price_spike',
      severity: 'medium',
      title: '采购价格上涨',
      message: `${increases.length} 个商品近期采购价上涨超过 ${purchase.priceThreshold}%，最高 +${max.toFixed(1)}%`,
      link: '/analytics',
      count: increases.length,
    });
  }

  if (payables.totalOutstanding > 0) {
    alerts.push({
      id: 'payables',
      type: 'payables',
      severity: 'low',
      title: '应付未结',
      message: `${payables.count} 家供应商尚有 ${formatMoney(payables.totalOutstanding)} 货款未结清`,
      link: '/payables',
      count: payables.count,
    });
  }

  const zeroSales = sales.slowMovers.filter((item) => item.soldQty === 0);
  if (zeroSales.length > 0) {
    alerts.push({
      id: 'slow-movers',
      type: 'slow_mover',
      severity: 'low',
      title: '滞销商品',
      message: `${zeroSales.length} 个商品近 ${sales.slowMoverDays} 天零销量，占用库存资金`,
      link: '/analytics',
      count: zeroSales.length,
    });
  }

  const severityRank: Record<AssistantAlertSeverity, number> = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

/* ------------------------------------------------------------------ */
/* 答案编排                                                            */
/* ------------------------------------------------------------------ */

function windowOf(snapshot: AssistantSnapshot, window: AssistantWindowKey): WindowMetrics {
  return (
    snapshot.windows.find((item) => item.days === window) ||
    snapshot.windows[snapshot.windows.length - 1] || {
      days: window,
      sales: { revenue: 0, cost: 0, grossProfit: 0, margin: 0, orderCount: 0 },
      purchase: { totalAmount: 0, invoiceCount: 0 },
    }
  );
}

function daysLeft(expiryDate: string, today: string): number {
  return daysBetween(today, expiryDate);
}

function productStatusLine(item: {
  quantity: number;
  safeStock: number | null;
  unit: string;
}): string {
  if (item.safeStock === null || item.safeStock === undefined) {
    return `当前库存 ${formatQty(item.quantity)} ${item.unit}（未设置安全库存）`;
  }
  const deficit = Math.round((item.safeStock - item.quantity) * 100) / 100;
  if (item.quantity <= 0) {
    return `当前库存 0 ${item.unit}，已缺货（安全库存 ${formatQty(item.safeStock)} ${item.unit}）`;
  }
  if (deficit > 0) {
    return `当前库存 ${formatQty(item.quantity)} ${item.unit}，低于安全库存 ${formatQty(
      item.safeStock
    )} ${item.unit}，缺口 ${formatQty(deficit)} ${item.unit}`;
  }
  return `当前库存 ${formatQty(item.quantity)} ${item.unit}，高于安全库存 ${formatQty(
    item.safeStock
  )} ${item.unit}`;
}

function overviewText(snapshot: AssistantSnapshot): string {
  const w7 = windowOf(snapshot, 7);
  const w30 = windowOf(snapshot, 30);
  const { inventory, expiring, purchase, payables } = snapshot;
  return [
    `当前资料库（${formatLocalDateTime(snapshot.generatedAt)} 同步，数据来自仓库实时记录）：`,
    `库存：${inventory.productCount} 个商品，总库存 ${formatQty(
      inventory.totalUnits
    )} 件，库存成本约 ${formatMoney(inventory.stockValueCost)}，零售价值约 ${formatMoney(
      inventory.stockValueRetail
    )}`,
    `预警：${inventory.lowStockCount} 个商品低于安全线（${inventory.zeroStockCount} 个已缺货）；${expiring.expiredCount} 个批次过期、${expiring.expiringCount} 个 ${expiring.days} 天内临期`,
    `销售：近 7 天 ${w7.sales.orderCount} 单 / ${formatMoney(
      w7.sales.revenue
    )}，毛利率 ${formatPercent(w7.sales.margin)}；近 30 天 ${w30.sales.orderCount} 单 / ${formatMoney(
      w30.sales.revenue
    )}`,
    `采购：近 30 天 ${w30.purchase.invoiceCount} 张已确认发票 / ${formatMoney(
      w30.purchase.totalAmount
    )}；待确认发票 ${purchase.pendingCount} 张`,
    `应付：${payables.count} 家供应商未结 ${formatMoney(payables.totalOutstanding)}`,
  ].join('\n');
}

function lowStockText(snapshot: AssistantSnapshot, product?: ProductIndexItem): string {
  const lines: string[] = [];
  if (product) {
    const low = snapshot.inventory.lowStock.find((item) => item.productId === product.productId);
    lines.push(`${productLabel(product)}：`);
    lines.push(`- ${productStatusLine(product)}`);
    if (product.supplierName) lines.push(`- 默认供应商：${product.supplierName}`);
    if (low) {
      const reorder = snapshot.reorder.find((item) => item.productId === product.productId);
      if (reorder) {
        lines.push(
          `- 建议补货：${formatQty(reorder.suggestedQuantity)} ${product.unit}（近 4 周周均消耗 ${formatQty(
            reorder.avgWeeklyUsage
          )} ${product.unit}）`
        );
      }
      lines.push(`- 紧急程度：${low.urgency === 'high' ? '高' : low.urgency === 'medium' ? '中' : '低'}`);
    }
    lines.push('');
  }

  const low = snapshot.inventory.lowStock;
  if (low.length === 0) {
    lines.push('目前没有商品低于安全库存，库存水位整体健康。');
    return lines.join('\n').trim();
  }

  lines.push(
    `当前有 ${snapshot.inventory.lowStockCount} 个商品低于安全库存，其中 ${snapshot.inventory.zeroStockCount} 个已缺货。缺口最大的商品：`
  );
  for (const [index, item] of low.slice(0, 8).entries()) {
    lines.push(
      `${index + 1}. ${productLabel(item)}${item.sku ? `（${item.sku}）` : ''}：现有 ${formatQty(
        item.quantity
      )} / 安全线 ${formatQty(item.safeStock)} ${item.unit}，缺口 ${formatQty(item.deficit)} ${item.unit}${
        item.supplierName ? `，供应商 ${item.supplierName}` : ''
      }`
    );
  }
  lines.push('');
  lines.push('建议：优先补缺口最大和已缺货的商品；「补货建议」会结合近 4 周消耗给出订货量。');
  return lines.join('\n');
}

function reorderText(snapshot: AssistantSnapshot, product?: ProductIndexItem): string {
  let items = snapshot.reorder;
  if (product) {
    const one = items.find((item) => item.productId === product.productId);
    items = one ? [one] : [];
  }
  if (items.length === 0) {
    return product
      ? `${productLabel(product)} 当前不需要补货，库存高于安全线。`
      : '当前所有商品都高于安全库存，暂时不需要补货。可以继续关注临期批次和滞销库存。';
  }

  const lines = product
    ? [`${productLabel(product)} 的补货建议：`]
    : [`补货建议（按缺口与近 4 周消耗估算，共 ${snapshot.reorder.length} 项）：`];
  let totalCost = 0;
  for (const [index, item] of items.slice(0, 8).entries()) {
    totalCost += item.estimatedCost;
    lines.push(
      `${index + 1}. ${productLabel(item)}：现有 ${formatQty(item.quantity)} / 安全线 ${formatQty(
        item.safeStock
      )} ${item.unit}，周均消耗 ${formatQty(item.avgWeeklyUsage)}，建议进 ${formatQty(
        item.suggestedQuantity
      )} ${item.unit}${item.lastPrice > 0 ? `（约 ${formatMoney(item.estimatedCost)}）` : ''}${
        item.supplierName ? `，供应商 ${item.supplierName}` : ''
      }`
    );
  }
  if (totalCost > 0) {
    lines.push('');
    lines.push(`以上前 ${Math.min(items.length, 8)} 项预计采购成本约 ${formatMoney(totalCost)}。`);
  }
  lines.push('建议先确认供应商到货周期，并按保质期安排先进先出。');
  return lines.join('\n');
}

function expiringText(snapshot: AssistantSnapshot, keyword?: string): string {
  const today = dateKey(snapshot.generatedAt);
  let items = snapshot.expiring.items;
  if (keyword) {
    const kw = keyword.toLowerCase();
    items = items.filter(
      (item) =>
        item.nameZh?.toLowerCase().includes(kw) || item.nameEn.toLowerCase().includes(kw)
    );
  }
  if (items.length === 0) {
    return keyword
      ? `没有找到与「${keyword}」相关的临期或过期批次。`
      : `未来 ${snapshot.expiring.days} 天内没有临期或过期批次，保质期状态良好。`;
  }
  const lines = [
    `临期/过期批次：已过期 ${snapshot.expiring.expiredCount} 个，${snapshot.expiring.days} 天内到期 ${snapshot.expiring.expiringCount} 个。`,
  ];
  for (const item of items.slice(0, 8)) {
    const left = daysLeft(item.expiryDate, today);
    lines.push(
      `- ${productLabel(item)}${item.batchNo ? ` 批次 ${item.batchNo}` : ''}：到期 ${item.expiryDate}，剩余 ${formatQty(
        item.quantity
      )}，${left < 0 ? `已过期 ${Math.abs(left)} 天` : left === 0 ? '今天到期' : `还剩 ${left} 天`}`
    );
  }
  lines.push('');
  lines.push('建议：已过期商品立即下架报损；3 天内到期的商品优先促销或做捆绑销售。');
  return lines.join('\n');
}

function salesText(snapshot: AssistantSnapshot, window: AssistantWindowKey): string {
  const metrics = windowOf(snapshot, window);
  const top = [...snapshot.sales.topProducts].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const lines = [
    `近 ${metrics.days} 天销售：`,
    `- 完成订单：${metrics.sales.orderCount} 单`,
    `- 销售额：${formatMoney(metrics.sales.revenue)}`,
    `- 销售成本：${formatMoney(metrics.sales.cost)}`,
    `- 毛利：${formatMoney(metrics.sales.grossProfit)}（毛利率 ${formatPercent(
      metrics.sales.margin
    )}）`,
  ];
  if (top.length > 0) {
    lines.push('');
    lines.push('销售额贡献前 5：');
    for (const [index, item] of top.entries()) {
      lines.push(
        `${index + 1}. ${productLabel(item)}：${formatMoney(item.revenue)}，毛利 ${formatMoney(
          item.profit
        )}，销量 ${formatQty(item.qty)}`
      );
    }
  }
  lines.push('');
  lines.push(
    metrics.sales.margin < 20
      ? '毛利率偏低，建议检查售价与采购成本，优先推动高毛利商品。'
      : '毛利率处于正常区间，可保持高毛利商品的库存水位。'
  );
  return lines.join('\n');
}

function profitText(snapshot: AssistantSnapshot, window: AssistantWindowKey): string {
  const metrics = windowOf(snapshot, window);
  const top = snapshot.sales.topProducts.slice(0, 5);
  const lines = [
    `近 ${metrics.days} 天毛利概览：`,
    `- 销售额 ${formatMoney(metrics.sales.revenue)}，成本 ${formatMoney(
      metrics.sales.cost
    )}，毛利 ${formatMoney(metrics.sales.grossProfit)}`,
    `- 毛利率 ${formatPercent(metrics.sales.margin)}，完成 ${metrics.sales.orderCount} 单`,
  ];
  if (top.length > 0) {
    lines.push('');
    lines.push('毛利贡献前 5：');
    for (const [index, item] of top.entries()) {
      lines.push(
        `${index + 1}. ${productLabel(item)}：毛利 ${formatMoney(item.profit)}，销售额 ${formatMoney(
          item.revenue
        )}`
      );
    }
  }
  if (snapshot.sales.slowMovers.length > 0) {
    lines.push('');
    lines.push(
      `另有 ${snapshot.sales.slowMovers.length} 个商品近 ${snapshot.sales.slowMoverDays} 天销量偏低，可考虑促销或减少下次订货。`
    );
  }
  return lines.join('\n');
}

function purchaseText(snapshot: AssistantSnapshot, window: AssistantWindowKey): string {
  const metrics = windowOf(snapshot, window);
  const lines = [
    `近 ${metrics.days} 天采购：${metrics.purchase.invoiceCount} 张已确认发票，金额 ${formatMoney(
      metrics.purchase.totalAmount
    )}。`,
  ];
  if (snapshot.purchase.pendingCount > 0) {
    lines.push(
      `另有 ${snapshot.purchase.pendingCount} 张待确认发票${
        snapshot.purchase.pendingOverdueCount > 0
          ? `（${snapshot.purchase.pendingOverdueCount} 张超过 3 天）`
          : ''
      }。`
    );
  }
  if (snapshot.purchase.topSuppliers.length > 0) {
    lines.push('');
    lines.push('采购额前 5 的供应商（近 30 天）：');
    for (const [index, item] of snapshot.purchase.topSuppliers.slice(0, 5).entries()) {
      lines.push(
        `${index + 1}. ${item.supplierName}：${formatMoney(item.totalAmount)}，${item.invoiceCount} 张发票`
      );
    }
  }
  if (snapshot.purchase.topProducts.length > 0) {
    lines.push('');
    lines.push('采购量前 5 的商品（近 30 天）：');
    for (const [index, item] of snapshot.purchase.topProducts.slice(0, 5).entries()) {
      lines.push(
        `${index + 1}. ${productLabel(item)}：${formatQty(item.totalQuantity)}，${formatMoney(
          item.totalAmount
        )}`
      );
    }
  }
  lines.push('');
  lines.push('建议结合库存缺口与近 4 周消耗下单，避免一次性压货。');
  return lines.join('\n');
}

function supplierText(snapshot: AssistantSnapshot): string {
  const lines: string[] = [];
  if (snapshot.purchase.topSuppliers.length === 0) {
    lines.push('近 30 天没有已确认的采购记录。');
  } else {
    lines.push('近 30 天供应商采购分布：');
    for (const [index, item] of snapshot.purchase.topSuppliers.slice(0, 6).entries()) {
      lines.push(
        `${index + 1}. ${item.supplierName}：${formatMoney(item.totalAmount)}，${item.invoiceCount} 张发票`
      );
    }
  }
  if (snapshot.payables.items.length > 0) {
    lines.push('');
    lines.push(`应付未结 ${formatMoney(snapshot.payables.totalOutstanding)}：`);
    for (const item of snapshot.payables.items.slice(0, 5)) {
      lines.push(
        `- ${item.supplierName}：${formatMoney(item.outstanding)}（${item.invoiceCount} 张发票${
          item.lastInvoiceDate ? `，最近 ${item.lastInvoiceDate}` : ''
        }）`
      );
    }
  }
  lines.push('');
  lines.push('建议优先核对采购占比高、应付金额大的供应商账期与报价。');
  return lines.join('\n');
}

function priceChangeText(snapshot: AssistantSnapshot, product?: ProductIndexItem): string {
  let items = snapshot.purchase.priceChanges;
  if (product) {
    items = items.filter((item) => item.productId === product.productId);
  }
  if (items.length === 0) {
    return product
      ? `${productLabel(product)} 近期没有超过 ${snapshot.purchase.priceThreshold}% 的采购价波动。`
      : `近期没有检测到超过 ${snapshot.purchase.priceThreshold}% 的采购价波动，价格整体平稳。`;
  }
  const lines = product
    ? [`${productLabel(product)} 的近期采购价变化：`]
    : [`近期采购价波动（阈值 ${snapshot.purchase.priceThreshold}%）：`];
  for (const item of items.slice(0, 8)) {
    lines.push(
      `- ${productLabel(item)}：${formatMoney(item.previousPrice)} → ${formatMoney(
        item.currentPrice
      )}（${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(1)}%）${
        item.supplierName ? `，${item.supplierName}` : ''
      }`
    );
  }
  const increases = items.filter((item) => item.changePercent > 0);
  lines.push('');
  lines.push(
    increases.length > 0
      ? '建议对涨幅较大的商品复核供应商报价，必要时比较替代货源。'
      : '价格整体下降，可结合库存与保质期适度增加采购。'
  );
  return lines.join('\n');
}

function payablesText(snapshot: AssistantSnapshot): string {
  if (snapshot.payables.totalOutstanding <= 0) {
    return '当前没有未结清的供应商应付账款。';
  }
  const lines = [
    `当前应付未结 ${formatMoney(snapshot.payables.totalOutstanding)}，涉及 ${
      snapshot.payables.count
    } 家供应商。`,
    '',
  ];
  for (const item of snapshot.payables.items.slice(0, 8)) {
    lines.push(
      `- ${item.supplierName}：${formatMoney(item.outstanding)}（${item.invoiceCount} 张发票${
        item.lastInvoiceDate ? `，最近 ${item.lastInvoiceDate}` : ''
      }）`
    );
  }
  lines.push('');
  lines.push('建议优先核对金额较大、账期较长的供应商，避免逾期影响后续供货。');
  return lines.join('\n');
}

function slowMoverText(snapshot: AssistantSnapshot): string {
  const items = snapshot.sales.slowMovers;
  if (items.length === 0) {
    return `近 ${snapshot.sales.slowMoverDays} 天没有发现明显滞销商品。`;
  }
  const lines = [
    `近 ${snapshot.sales.slowMoverDays} 天滞销商品（有库存但销量最低）：`,
  ];
  for (const item of items.slice(0, 8)) {
    lines.push(
      `- ${productLabel(item)}：库存 ${formatQty(item.currentStock)}，近 ${snapshot.sales.slowMoverDays} 天销量 ${formatQty(
        item.soldQty
      )}`
    );
  }
  lines.push('');
  lines.push('建议：对零销量商品做促销/捆绑销售，并下调下一次采购量，避免继续占用资金。');
  return lines.join('\n');
}

function pendingInvoiceText(snapshot: AssistantSnapshot): string {
  if (snapshot.purchase.pendingCount === 0) {
    return '当前没有待确认的发票，入库与应付数据已同步。';
  }
  return [
    `当前有 ${snapshot.purchase.pendingCount} 张发票待确认。`,
    snapshot.purchase.pendingOverdueCount > 0
      ? `其中 ${snapshot.purchase.pendingOverdueCount} 张已超过 3 天，建议优先处理。`
      : '发票确认后才会更新库存与应付账款。',
    '建议先处理金额较大的单据，并核对 OCR 识别出的商品与数量。',
  ].join('\n');
}

function productLookupText(snapshot: AssistantSnapshot, product: ProductIndexItem): string {
  const lines = [`${productLabel(product)}${product.sku ? `（SKU: ${product.sku}）` : ''}：`];
  lines.push(`- ${productStatusLine(product)}`);
  if (product.supplierName) lines.push(`- 默认供应商：${product.supplierName}`);
  if (product.defaultPrice !== null) {
    lines.push(`- 采购成本：${formatMoney(product.defaultPrice)} / ${product.unit}`);
  }
  if (product.sellingPrice !== null) {
    lines.push(`- 零售价：${formatMoney(product.sellingPrice)} / ${product.unit}`);
  }
  const priceChange = snapshot.purchase.priceChanges.find(
    (item) => item.productId === product.productId
  );
  if (priceChange) {
    lines.push(
      `- 近期进价：${formatMoney(priceChange.previousPrice)} → ${formatMoney(
        priceChange.currentPrice
      )}（${priceChange.changePercent > 0 ? '+' : ''}${priceChange.changePercent.toFixed(1)}%）`
    );
  }
  const reorder = snapshot.reorder.find((item) => item.productId === product.productId);
  if (reorder) {
    lines.push(
      `- 建议补货：${formatQty(reorder.suggestedQuantity)} ${product.unit}（周均消耗 ${formatQty(
        reorder.avgWeeklyUsage
      )} ${product.unit}）`
    );
  }
  if (product.safeStock !== null && product.quantity <= product.safeStock) {
    const low = snapshot.inventory.lowStock.find((item) => item.productId === product.productId);
    if (low) {
      lines.push(
        `- 状态：${low.urgency === 'high' ? '紧急缺货风险' : '低于安全库存'}，请尽快安排补货`
      );
    }
  } else {
    lines.push('- 状态：库存充足');
  }
  return lines.join('\n');
}

function suggestionsFor(intent: AssistantIntentName): string[] {
  const map: Record<AssistantIntentName, string[]> = {
    greeting: ['哪些商品需要补货？', '当前库存预警有哪些？', '近 30 天毛利如何？'],
    help: ['哪些商品需要补货？', '临期批次有哪些？', '供应商应付还有多少？'],
    overview: ['哪些商品需要补货？', '近 7 天销售怎么样？', '库存预警有哪些？'],
    alerts: ['哪些商品需要补货？', '临期批次有哪些？', '待确认发票有多少？'],
    low_stock: ['给我补货建议', '哪些商品已经缺货？', '临期商品有哪些？'],
    reorder: ['这些商品分别找哪个供应商？', '当前库存预警有哪些？', '哪些商品滞销？'],
    expiring: ['哪些商品需要补货？', '过期批次怎么处理？', '近 30 天销售如何？'],
    sales: ['毛利情况怎么样？', '销售额最高的商品是什么？', '哪些商品滞销？'],
    profit: ['哪些商品毛利最高？', '采购成本有上涨吗？', '哪些商品滞销？'],
    purchase: ['主要供应商是谁？', '采购价有波动吗？', '待确认发票有多少？'],
    price_change: ['哪些商品涨价最多？', '供应商应付还有多少？', '哪些商品需要补货？'],
    supplier: ['应付账款还有多少？', '近 30 天采购额多少？', '采购价有波动吗？'],
    payables: ['各供应商分别欠多少？', '近 30 天采购额多少？', '哪些发票待确认？'],
    slow_mover: ['近 30 天销售怎么样？', '哪些商品需要补货？', '如何减少库存资金占用？'],
    pending_invoice: ['待确认发票金额多少？', '哪些商品需要补货？', '库存预警有哪些？'],
    product_lookup: ['这个商品需要补货吗？', '它的采购价有变化吗？', '当前库存预警有哪些？'],
    unknown: ['当前库存情况如何？', '哪些商品需要补货？', '近 30 天毛利如何？'],
  };
  return map[intent] || map.unknown;
}

function sourcesFor(intent: AssistantIntentName): string[] {
  const map: Record<AssistantIntentName, string[]> = {
    greeting: ['inventory'],
    help: ['inventory'],
    overview: ['inventory', 'sales', 'purchase', 'payables', 'batches'],
    alerts: ['inventory', 'batches', 'purchase', 'payables'],
    low_stock: ['inventory'],
    reorder: ['inventory', 'inventory_logs'],
    expiring: ['inventory_batches'],
    sales: ['sales_orders', 'sales_items'],
    profit: ['sales_orders', 'sales_items'],
    purchase: ['invoices', 'invoice_items', 'suppliers'],
    price_change: ['invoices', 'invoice_items'],
    supplier: ['invoices', 'suppliers', 'supplier_payments'],
    payables: ['invoices', 'supplier_payments'],
    slow_mover: ['sales_orders', 'sales_items', 'inventory'],
    pending_invoice: ['invoices'],
    product_lookup: ['inventory', 'products', 'invoice_items'],
    unknown: ['inventory', 'sales'],
  };
  return map[intent] || ['inventory'];
}

export function composeAnswer(intent: AssistantIntent, snapshot: AssistantSnapshot): LocalAnswer {
  let reply: string;

  switch (intent.name) {
    case 'greeting':
      reply = `你好，我是熊猫超市的本地智能助手。我不依赖 LLM，直接读取当前资料库回答问题。\n\n${overviewText(
        snapshot
      )}\n\n你可以问库存、补货、临期、销售、采购、供应商和应付账款等问题。`;
      break;
    case 'help':
      reply = [
        '我可以直接基于当前仓库资料库回答：',
        '- 库存与补货：哪些商品低于安全线、建议进多少、找哪个供应商',
        '- 保质期：哪些批次临期或已过期',
        '- 销售与毛利：近 7/30/90 天销售额、成本、毛利率、畅销商品',
        '- 采购与价格：采购额、主要供应商、进价涨跌',
        '- 应付与发票：欠供应商多少、哪些发票待确认',
        '- 盘点单品：直接说商品名或 SKU，例如「苹果还有多少库存」',
        '',
        '资料库随发票确认、销售出库和库存调整自动刷新；也可以在「智能助手」页手动刷新。',
      ].join('\n');
      break;
    case 'overview':
      reply = `${overviewText(snapshot)}\n\n想深入看哪一块？${suggestionsFor(
        'overview'
      ).join(' / ')}`;
      break;
    case 'alerts': {
      const alerts = deriveAlerts(snapshot);
      if (alerts.length === 0) {
        reply = '当前没有发现需要处理的库存或经营预警，各项指标正常。';
      } else {
        const label: Record<AssistantAlertSeverity, string> = {
          high: '紧急',
          medium: '关注',
          low: '提示',
        };
        reply = [
          `当前共 ${alerts.length} 项预警：`,
          ...alerts.map(
            (alert, index) =>
              `${index + 1}. [${label[alert.severity]}] ${alert.title}：${alert.message}`
          ),
          '',
          '建议先处理「紧急」项，其余可按模块逐步跟进。',
        ].join('\n');
      }
      break;
    }
    case 'low_stock':
      reply = lowStockText(snapshot, intent.product);
      break;
    case 'reorder':
      reply = reorderText(snapshot, intent.product);
      break;
    case 'expiring':
      reply = expiringText(snapshot, intent.keyword);
      break;
    case 'sales':
      reply = salesText(snapshot, intent.window);
      break;
    case 'profit':
      reply = profitText(snapshot, intent.window);
      break;
    case 'purchase':
      reply = purchaseText(snapshot, intent.window);
      break;
    case 'price_change':
      reply = priceChangeText(snapshot, intent.product);
      break;
    case 'supplier':
      reply = supplierText(snapshot);
      break;
    case 'payables':
      reply = payablesText(snapshot);
      break;
    case 'slow_mover':
      reply = slowMoverText(snapshot);
      break;
    case 'pending_invoice':
      reply = pendingInvoiceText(snapshot);
      break;
    case 'product_lookup':
      reply = intent.product
        ? productLookupText(snapshot, intent.product)
        : overviewText(snapshot);
      break;
    default:
      reply = `${overviewText(snapshot)}\n\n我没有完全理解你的问题。可以换个说法，或试试：\n- ${suggestionsFor(
        'unknown'
      ).join('\n- ')}`;
      break;
  }

  return {
    reply,
    intent: intent.name,
    confidence: intent.confidence,
    windowDays: intent.window,
    suggestions: suggestionsFor(intent.name).slice(0, 3),
    sources: sourcesFor(intent.name),
  };
}

/* ------------------------------------------------------------------ */
/* 经营简报与资料库摘要                                                 */
/* ------------------------------------------------------------------ */

export function buildReport(
  snapshot: AssistantSnapshot,
  period: 'week' | 'month'
): LocalReport {
  const days = period === 'month' ? 30 : 7;
  const window = windowOf(snapshot, pickWindow(days));
  const alerts = deriveAlerts(snapshot);
  const highAlerts = alerts.filter((alert) => alert.severity === 'high');

  const summary = [
    `${days === 7 ? '周度' : '月度'}经营简报（${formatLocalDateTime(snapshot.generatedAt)}）：`,
    `销售：${window.sales.orderCount} 单，${formatMoney(window.sales.revenue)}，毛利 ${formatMoney(
      window.sales.grossProfit
    )}（毛利率 ${formatPercent(window.sales.margin)}）。`,
    `采购：${window.purchase.invoiceCount} 张已确认发票，${formatMoney(
      window.purchase.totalAmount
    )}；待确认 ${snapshot.purchase.pendingCount} 张。`,
    `库存：${snapshot.inventory.lowStockCount} 个商品低于安全线（${snapshot.inventory.zeroStockCount} 个缺货），${snapshot.expiring.expiredCount} 个批次过期、${snapshot.expiring.expiringCount} 个临期。`,
    `应付：${snapshot.payables.count} 家供应商未结 ${formatMoney(snapshot.payables.totalOutstanding)}。`,
    highAlerts.length > 0
      ? `需要优先处理：${highAlerts.map((alert) => alert.title).join('、')}。`
      : '本期没有需要紧急处理的风险项。',
  ].join('\n');

  return {
    period,
    summary,
    alerts: alerts.map((alert) => ({
      type: alert.type,
      message: `${alert.title}：${alert.message}`,
    })),
    generatedAt: snapshot.generatedAt,
  };
}

/** 给 LLM 的紧凑资料库上下文：限制长度，避免占用过多 token。 */
export function compactContext(snapshot: AssistantSnapshot): string {
  const w7 = windowOf(snapshot, 7);
  const w30 = windowOf(snapshot, 30);
  const low = snapshot.inventory.lowStock
    .slice(0, 5)
    .map((item) => `${productLabel(item)} ${formatQty(item.quantity)}/${formatQty(item.safeStock)}${item.unit}`)
    .join('；');
  const expiring = snapshot.expiring.items
    .slice(0, 5)
    .map((item) => `${productLabel(item)} ${item.expiryDate} ${formatQty(item.quantity)}${item.expired ? '(已过期)' : ''}`)
    .join('；');
  const suppliers = snapshot.purchase.topSuppliers
    .slice(0, 4)
    .map((item) => `${item.supplierName} ${formatMoney(item.totalAmount)}`)
    .join('；');

  return [
    `资料库快照 ${snapshot.generatedAt}（实时数据库）`,
    `库存：${snapshot.inventory.productCount} 个商品，低库存 ${snapshot.inventory.lowStockCount}（缺货 ${snapshot.inventory.zeroStockCount}），库存成本 ${formatMoney(snapshot.inventory.stockValueCost)}`,
    `低库存TOP：${low || '无'}`,
    `临期/过期：过期 ${snapshot.expiring.expiredCount}、临期 ${snapshot.expiring.expiringCount}${expiring ? `；${expiring}` : ''}`,
    `销售近7天：${w7.sales.orderCount}单 ${formatMoney(w7.sales.revenue)}，毛利率 ${formatPercent(w7.sales.margin)}；近30天 ${w30.sales.orderCount}单 ${formatMoney(w30.sales.revenue)}`,
    `采购近30天：${w30.purchase.invoiceCount}张 ${formatMoney(w30.purchase.totalAmount)}，待确认 ${snapshot.purchase.pendingCount} 张；主要供应商：${suppliers || '无'}`,
    `应付未结：${formatMoney(snapshot.payables.totalOutstanding)}（${snapshot.payables.count} 家）`,
    `价格异动：${snapshot.purchase.priceChanges.length} 个商品超过 ${snapshot.purchase.priceThreshold}%`,
    `补货建议：${snapshot.reorder
      .slice(0, 5)
      .map((item) => `${productLabel(item)} +${formatQty(item.suggestedQuantity)}${item.unit}`)
      .join('；') || '无'}`,
  ].join('\n');
}
