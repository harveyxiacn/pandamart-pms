/**
 * 资料库（Knowledge Base）构建服务。
 *
 * 每次请求不直接扫描全库：把当次运营状态整理成一个「快照」，缓存 60 秒；
 * 发票确认、销售出库、库存调整等写操作会通过 invalidateAnalyticsCache()
 * 同步清掉 assistant: 前缀，因此页面刷新后能立刻看到最新仓库情况。
 *
 * 快照同时服务三种消费方：
 *   1. 本地规则引擎（assistant-engine.ts）回答自然语言问题；
 *   2. 前端「资料库」面板与库存预警；
 *   3. LLM 模式的系统提示词上下文（compactContext 限制 token）。
 */
import db from '../config/database';
import { SettingModel } from '../models/Setting';
import { batchService } from './batch.service';
import { payablesService } from './payables.service';
import { analyticsService } from './analytics.service';
import { cached, invalidateCache } from '../utils/cache';
import { parseBoundedInt } from '../utils/helpers';
import { toDateKey } from './batch-fifo';
import {
  buildReport,
  compactContext,
  deriveAlerts,
  formatMoney,
  type AssistantAlert,
  type AssistantSnapshot,
  type ExpiringItem,
  type LowStockItem,
  type PayableItem,
  type PriceChangeItem,
  type ProductIndexItem,
  type PurchaseProductItem,
  type ReorderItem,
  type SlowMoverItem,
  type SupplierPurchaseItem,
  type TopProductItem,
  type WindowMetrics,
  type AssistantWindowKey,
} from './assistant-engine';

const SNAPSHOT_KEY = 'assistant:snapshot:v1';
const DEFAULT_SNAPSHOT_TTL_MS = 60 * 1000;
const MAX_PRODUCT_INDEX = 3000;
const MAX_REORDER = 60;
const MAX_EXPIRING_ITEMS = 60;

type Row = Record<string, any>;

function offsetDay(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return toDateKey(d)!;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(() => fallback);
}

async function loadInventoryAggregate(): Promise<{
  productCount: number;
  totalUnits: number;
  lowStockCount: number;
  zeroStockCount: number;
  stockValueCost: number;
  stockValueRetail: number;
}> {
  const row = await db('inventory')
    .join('products', 'inventory.product_id', 'products.id')
    .whereNull('products.deleted_at')
    .select(
      db.raw('COUNT(inventory.id) as productCount'),
      db.raw('COALESCE(SUM(inventory.quantity), 0) as totalUnits'),
      db.raw(
        'COALESCE(SUM(CASE WHEN inventory.safe_stock IS NOT NULL AND inventory.quantity < inventory.safe_stock THEN 1 ELSE 0 END), 0) as lowStockCount'
      ),
      db.raw(
        'COALESCE(SUM(CASE WHEN inventory.quantity <= 0 THEN 1 ELSE 0 END), 0) as zeroStockCount'
      ),
      db.raw(
        'COALESCE(SUM(inventory.quantity * COALESCE(products.default_price, 0)), 0) as stockValueCost'
      ),
      db.raw(
        'COALESCE(SUM(inventory.quantity * COALESCE(products.selling_price, 0)), 0) as stockValueRetail'
      )
    )
    .first();

  return {
    productCount: num(row?.productCount),
    totalUnits: round2(num(row?.totalUnits)),
    lowStockCount: num(row?.lowStockCount),
    zeroStockCount: num(row?.zeroStockCount),
    stockValueCost: round2(num(row?.stockValueCost)),
    stockValueRetail: round2(num(row?.stockValueRetail)),
  };
}

async function loadProductIndex(): Promise<ProductIndexItem[]> {
  const rows = await db('inventory')
    .join('products', 'inventory.product_id', 'products.id')
    .leftJoin('suppliers', 'products.default_supplier_id', 'suppliers.id')
    .whereNull('products.deleted_at')
    .select(
      'inventory.product_id as productId',
      'products.name_en as nameEn',
      'products.name_zh as nameZh',
      'products.sku',
      'products.barcode',
      'inventory.quantity',
      'inventory.safe_stock as safeStock',
      'inventory.unit',
      'suppliers.name as supplierName',
      'products.default_price as defaultPrice',
      'products.selling_price as sellingPrice'
    )
    .orderBy('products.name_en', 'asc')
    .limit(MAX_PRODUCT_INDEX);

  return (rows as Row[]).map((row) => ({
    productId: num(row.productId),
    nameEn: String(row.nameEn || '未命名商品'),
    nameZh: row.nameZh ?? null,
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    quantity: num(row.quantity),
    safeStock: row.safeStock === null || row.safeStock === undefined ? null : num(row.safeStock),
    unit: String(row.unit || 'Case'),
    supplierName: row.supplierName ?? null,
    defaultPrice:
      row.defaultPrice === null || row.defaultPrice === undefined ? null : num(row.defaultPrice),
    sellingPrice:
      row.sellingPrice === null || row.sellingPrice === undefined
        ? null
        : num(row.sellingPrice),
  }));
}

interface SalesDailyRow {
  day: string;
  revenue: number;
  cost: number;
  orderCount: number;
}

async function loadSalesDaily(now: Date): Promise<SalesDailyRow[]> {
  const cutoff = offsetDay(-91, now);
  const rows = await db('sales_items')
    .join('sales_orders', 'sales_items.sales_order_id', 'sales_orders.id')
    .where('sales_orders.status', 'completed')
    .where('sales_orders.created_at', '>=', `${cutoff} 00:00:00`)
    .select(
      db.raw('DATE(sales_orders.created_at) as day'),
      db.raw('COALESCE(SUM(sales_items.line_total), 0) as revenue'),
      db.raw(
        'COALESCE(SUM(COALESCE(sales_items.cost_price, 0) * sales_items.quantity), 0) as cost'
      ),
      db.raw('COUNT(DISTINCT sales_orders.id) as orderCount')
    )
    .groupByRaw('DATE(sales_orders.created_at)')
    .orderByRaw('DATE(sales_orders.created_at) ASC');

  return (rows as Row[]).map((row) => ({
    day: toDateKey(row.day) || '',
    revenue: num(row.revenue),
    cost: num(row.cost),
    orderCount: num(row.orderCount),
  }));
}

interface PurchaseDailyRow {
  day: string;
  supplierId: number | null;
  supplierName: string | null;
  totalAmount: number;
  invoiceCount: number;
}

async function loadPurchaseDaily(now: Date): Promise<PurchaseDailyRow[]> {
  const cutoff = offsetDay(-91, now);
  const rows = await db('invoices')
    .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .where('invoices.status', 'confirmed')
    .where('invoices.invoice_date', '>=', cutoff)
    .select(
      'invoices.invoice_date as day',
      'invoices.supplier_id as supplierId',
      'suppliers.name as supplierName',
      db.raw('COALESCE(SUM(invoices.grand_total), 0) as totalAmount'),
      db.raw('COUNT(*) as invoiceCount')
    )
    .groupBy('invoices.invoice_date', 'invoices.supplier_id', 'suppliers.name')
    .orderBy('invoices.invoice_date', 'asc');

  return (rows as Row[]).map((row) => ({
    day: toDateKey(row.day) || '',
    supplierId: row.supplierId === null || row.supplierId === undefined ? null : num(row.supplierId),
    supplierName: row.supplierName ?? null,
    totalAmount: num(row.totalAmount),
    invoiceCount: num(row.invoiceCount),
  }));
}

function buildWindows(
  salesDaily: SalesDailyRow[],
  purchaseDaily: PurchaseDailyRow[],
  now: Date
): WindowMetrics[] {
  const windows: AssistantWindowKey[] = [1, 7, 30, 90];
  return windows.map((days) => {
    const cutoff = offsetDay(-(days - 1), now);
    const salesRows = salesDaily.filter((row) => row.day >= cutoff);
    const purchaseRows = purchaseDaily.filter((row) => row.day >= cutoff);

    const revenue = round2(salesRows.reduce((sum, row) => sum + row.revenue, 0));
    const cost = round2(salesRows.reduce((sum, row) => sum + row.cost, 0));
    const grossProfit = round2(revenue - cost);
    const orderCount = salesRows.reduce((sum, row) => sum + row.orderCount, 0);

    return {
      days,
      sales: {
        revenue,
        cost,
        grossProfit,
        margin: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
        orderCount,
      },
      purchase: {
        totalAmount: round2(purchaseRows.reduce((sum, row) => sum + row.totalAmount, 0)),
        invoiceCount: purchaseRows.reduce((sum, row) => sum + row.invoiceCount, 0),
      },
    };
  });
}

async function loadTopSalesProducts(now: Date): Promise<TopProductItem[]> {
  const cutoff = offsetDay(-29, now);
  const rows = await db('sales_items')
    .join('sales_orders', 'sales_items.sales_order_id', 'sales_orders.id')
    .join('products', 'sales_items.product_id', 'products.id')
    .where('sales_orders.status', 'completed')
    .where('sales_orders.created_at', '>=', `${cutoff} 00:00:00`)
    .select(
      'sales_items.product_id as productId',
      'products.name_en as nameEn',
      'products.name_zh as nameZh',
      db.raw('COALESCE(SUM(sales_items.line_total), 0) as revenue'),
      db.raw(
        'COALESCE(SUM(sales_items.line_total - COALESCE(sales_items.cost_price, 0) * sales_items.quantity), 0) as profit'
      ),
      db.raw('COALESCE(SUM(sales_items.quantity), 0) as qty')
    )
    .groupBy('sales_items.product_id', 'products.name_en', 'products.name_zh')
    .orderByRaw('profit DESC')
    .limit(10);

  return (rows as Row[]).map((row) => ({
    productId: num(row.productId),
    nameEn: String(row.nameEn || '未命名商品'),
    nameZh: row.nameZh ?? null,
    revenue: round2(num(row.revenue)),
    profit: round2(num(row.profit)),
    qty: round2(num(row.qty)),
  }));
}

async function loadTopPurchaseProducts(now: Date): Promise<PurchaseProductItem[]> {
  const cutoff = offsetDay(-29, now);
  const rows = await db('invoice_items')
    .join('invoices', 'invoice_items.invoice_id', 'invoices.id')
    .join('products', 'invoice_items.product_id', 'products.id')
    .where('invoices.status', 'confirmed')
    .where('invoices.invoice_date', '>=', cutoff)
    .whereNotNull('invoice_items.product_id')
    .select(
      'invoice_items.product_id as productId',
      'products.name_en as nameEn',
      'products.name_zh as nameZh',
      db.raw('COALESCE(SUM(invoice_items.quantity), 0) as totalQuantity'),
      db.raw('COALESCE(SUM(invoice_items.line_total), 0) as totalAmount'),
      db.raw('COALESCE(AVG(invoice_items.unit_price), 0) as avgPrice')
    )
    .groupBy('invoice_items.product_id', 'products.name_en', 'products.name_zh')
    .orderByRaw('totalQuantity DESC')
    .limit(10);

  return (rows as Row[]).map((row) => ({
    productId: num(row.productId),
    nameEn: String(row.nameEn || '未命名商品'),
    nameZh: row.nameZh ?? null,
    totalQuantity: round2(num(row.totalQuantity)),
    totalAmount: round2(num(row.totalAmount)),
    avgPrice: round2(num(row.avgPrice)),
  }));
}

async function loadPendingInvoices(): Promise<{ count: number; overdueCount: number }> {
  const row = await db('invoices')
    .where('status', 'pending')
    .select(
      db.raw('COUNT(*) as count'),
      db.raw(
        'COALESCE(SUM(CASE WHEN created_at < DATE_SUB(NOW(), INTERVAL 3 DAY) THEN 1 ELSE 0 END), 0) as overdueCount'
      )
    )
    .first();
  return { count: num(row?.count), overdueCount: num(row?.overdueCount) };
}

function topSuppliersFrom(
  purchaseDaily: PurchaseDailyRow[],
  now: Date,
  limit = 6
): SupplierPurchaseItem[] {
  const cutoff = offsetDay(-29, now);
  const map = new Map<number, SupplierPurchaseItem>();
  for (const row of purchaseDaily) {
    if (row.day < cutoff || row.supplierId === null) continue;
    const existing = map.get(row.supplierId) || {
      supplierId: row.supplierId,
      supplierName: row.supplierName || `#${row.supplierId}`,
      totalAmount: 0,
      invoiceCount: 0,
    };
    existing.totalAmount = round2(existing.totalAmount + row.totalAmount);
    existing.invoiceCount += row.invoiceCount;
    map.set(row.supplierId, existing);
  }
  return Array.from(map.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit);
}

async function buildSnapshot(): Promise<AssistantSnapshot> {
  const now = new Date();
  const today = offsetDay(0, now);
  const slowDays = parseBoundedInt(await SettingModel.get('slow_moving_days'), {
    defaultValue: 30,
    min: 1,
    max: 365,
  });
  const rawThreshold = Number(await SettingModel.get('price_alert_threshold'));
  const thresholdPercent =
    Number.isFinite(rawThreshold) && rawThreshold > 0
      ? rawThreshold <= 1
        ? Math.round(rawThreshold * 1000) / 10
        : rawThreshold
      : 10;

  const [
    inventoryAggregate,
    products,
    salesDaily,
    purchaseDaily,
    pendingInvoices,
    topSalesProducts,
    topPurchaseProducts,
    rawPriceChanges,
    slowMovers,
    expiringSummary,
    payables,
    reorderRaw,
  ] = await Promise.all([
    safe(loadInventoryAggregate(), {
      productCount: 0,
      totalUnits: 0,
      lowStockCount: 0,
      zeroStockCount: 0,
      stockValueCost: 0,
      stockValueRetail: 0,
    }),
    safe(loadProductIndex(), []),
    safe(loadSalesDaily(now), []),
    safe(loadPurchaseDaily(now), []),
    safe(loadPendingInvoices(), { count: 0, overdueCount: 0 }),
    safe(loadTopSalesProducts(now), []),
    safe(loadTopPurchaseProducts(now), []),
    safe(
      analyticsService.getPriceChanges({
        threshold: thresholdPercent,
        dateFrom: offsetDay(-90, now),
        dateTo: today,
        limit: 15,
      }),
      []
    ),
    safe(analyticsService.getSalesSlowMovers({ days: slowDays, limit: 10 }), {
      days: slowDays,
      items: [],
    }),
    safe(batchService.getExpiringSummary(14, MAX_EXPIRING_ITEMS), {
      days: 14,
      expiredCount: 0,
      expiringCount: 0,
      items: [],
    }),
    safe(payablesService.listPayables(), { items: [], totalOutstanding: 0 }),
    safe(analyticsService.getReorderSuggestions(), []),
  ]);

  const productMap = new Map(products.map((product) => [product.productId, product]));

  const reorder: ReorderItem[] = (reorderRaw as Row[]).slice(0, MAX_REORDER).map((row) => {
    const product = productMap.get(num(row.productId));
    const quantity = num(row.currentStock);
    const safeStock = num(row.safeStock);
    return {
      productId: num(row.productId),
      nameEn: String(row.nameEn || '未命名商品'),
      nameZh: row.nameZh ?? null,
      sku: product?.sku ?? null,
      quantity,
      safeStock,
      unit: String(product?.unit || 'Case'),
      deficit: round2(Math.max(0, safeStock - quantity)),
      supplierName: row.suggestedSupplier?.name ?? product?.supplierName ?? null,
      urgency: (row.urgency as ReorderItem['urgency']) || 'medium',
      avgWeeklyUsage: round2(num(row.avgWeeklyUsage)),
      suggestedQuantity: round2(num(row.suggestedQuantity)),
      estimatedCost: round2(num(row.estimatedCost)),
      lastPrice: round2(num(row.lastPrice)),
    };
  });

  const lowStock: LowStockItem[] = reorder
    .slice()
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.urgency] - rank[b.urgency] || b.deficit - a.deficit;
    })
    .slice(0, 30)
    .map((item) => ({
      productId: item.productId,
      nameEn: item.nameEn,
      nameZh: item.nameZh,
      sku: item.sku,
      quantity: item.quantity,
      safeStock: item.safeStock,
      unit: item.unit,
      deficit: item.deficit,
      supplierName: item.supplierName,
      urgency: item.urgency,
    }));

  const priceChanges: PriceChangeItem[] = (rawPriceChanges as Row[]).map((row) => ({
    productId: num(row.productId),
    nameEn: String(row.nameEn || '未命名商品'),
    nameZh: row.nameZh ?? null,
    previousPrice: round2(num(row.previousPrice)),
    currentPrice: round2(num(row.currentPrice)),
    changePercent: round2(num(row.changePercent)),
    supplierName: row.supplierName ?? null,
  }));

  const expiringItems: ExpiringItem[] = ((expiringSummary as Row).items || []).map((item: Row) => ({
    productId: num(item.productId),
    nameEn: String(item.nameEn || '未命名商品'),
    nameZh: item.nameZh ?? null,
    batchNo: item.batchNo ?? null,
    expiryDate: toDateKey(item.expiryDate) || '',
    quantity: round2(num(item.quantity)),
    expired: Boolean(item.expired),
  }));

  const payableItems: PayableItem[] = ((payables as Row).items || [])
    .filter((item: Row) => num(item.outstanding) > 0.009)
    .map((item: Row) => ({
      supplierId: num(item.supplierId),
      supplierName: String(item.supplierName || `#${item.supplierId}`),
      outstanding: round2(num(item.outstanding)),
      invoiceCount: num(item.invoiceCount),
      lastInvoiceDate: item.lastInvoiceDate ? toDateKey(item.lastInvoiceDate) : null,
    }))
    .sort((a: PayableItem, b: PayableItem) => b.outstanding - a.outstanding);

  return {
    generatedAt: now.toISOString(),
    source: 'live-db',
    inventory: {
      ...inventoryAggregate,
      lowStock,
      products,
    },
    windows: buildWindows(salesDaily, purchaseDaily, now),
    sales: {
      topProducts: topSalesProducts,
      slowMovers: (slowMovers as Row).items.map((item: Row) => ({
        productId: num(item.productId),
        nameEn: String(item.nameEn || '未命名商品'),
        nameZh: item.nameZh ?? null,
        currentStock: round2(num(item.currentStock)),
        soldQty: round2(num(item.soldQty)),
      })),
      slowMoverDays: slowDays,
    },
    purchase: {
      pendingCount: pendingInvoices.count,
      pendingOverdueCount: pendingInvoices.overdueCount,
      topSuppliers: topSuppliersFrom(purchaseDaily, now),
      topProducts: topPurchaseProducts,
      priceChanges,
      priceThreshold: thresholdPercent,
    },
    expiring: {
      days: 14,
      expiredCount: num((expiringSummary as Row).expiredCount),
      expiringCount: num((expiringSummary as Row).expiringCount),
      items: expiringItems,
    },
    reorder,
    payables: {
      totalOutstanding: round2(num((payables as Row).totalOutstanding)),
      count: payableItems.length,
      items: payableItems,
    },
  };
}

export interface AssistantKnowledge {
  snapshot: AssistantSnapshot;
  alerts: AssistantAlert[];
  knowledgeText: string;
  summary: {
    generatedAt: string;
    productCount: number;
    lowStockCount: number;
    zeroStockCount: number;
    expiringCount: number;
    expiredCount: number;
    pendingInvoices: number;
    payablesOutstanding: number;
    sales7: { revenue: number; margin: number; orderCount: number };
    sales30: { revenue: number; margin: number; orderCount: number };
    purchase30: { totalAmount: number; invoiceCount: number };
    reorderTop: ReorderItem[];
    expiringTop: ExpiringItem[];
    topSuppliers: SupplierPurchaseItem[];
    topProducts: TopProductItem[];
  };
}

export const knowledgeService = {
  async getSnapshot(force = false): Promise<AssistantSnapshot> {
    if (force) invalidateCache('assistant:');
    const configured = Number(
      await SettingModel.get('assistant_snapshot_ttl_seconds').catch(() => null)
    );
    const ttl =
      Number.isFinite(configured) && configured >= 15
        ? Math.min(600, Math.round(configured)) * 1000
        : DEFAULT_SNAPSHOT_TTL_MS;
    return cached(SNAPSHOT_KEY, ttl, buildSnapshot);
  },

  async getKnowledge(force = false): Promise<AssistantKnowledge> {
    const snapshot = await this.getSnapshot(force);
    const w7 = snapshot.windows.find((item) => item.days === 7)!;
    const w30 = snapshot.windows.find((item) => item.days === 30)!;

    return {
      snapshot,
      alerts: deriveAlerts(snapshot),
      knowledgeText: compactContext(snapshot),
      summary: {
        generatedAt: snapshot.generatedAt,
        productCount: snapshot.inventory.productCount,
        lowStockCount: snapshot.inventory.lowStockCount,
        zeroStockCount: snapshot.inventory.zeroStockCount,
        expiringCount: snapshot.expiring.expiringCount,
        expiredCount: snapshot.expiring.expiredCount,
        pendingInvoices: snapshot.purchase.pendingCount,
        payablesOutstanding: snapshot.payables.totalOutstanding,
        sales7: {
          revenue: w7.sales.revenue,
          margin: w7.sales.margin,
          orderCount: w7.sales.orderCount,
        },
        sales30: {
          revenue: w30.sales.revenue,
          margin: w30.sales.margin,
          orderCount: w30.sales.orderCount,
        },
        purchase30: {
          totalAmount: w30.purchase.totalAmount,
          invoiceCount: w30.purchase.invoiceCount,
        },
        reorderTop: snapshot.reorder.slice(0, 5),
        expiringTop: snapshot.expiring.items.slice(0, 5),
        topSuppliers: snapshot.purchase.topSuppliers.slice(0, 5),
        topProducts: snapshot.sales.topProducts.slice(0, 5),
      },
    };
  },

  async getAlerts(force = false): Promise<AssistantAlert[]> {
    const snapshot = await this.getSnapshot(force);
    return deriveAlerts(snapshot);
  },

  async getReport(period: 'week' | 'month'): Promise<ReturnType<typeof buildReport>> {
    const snapshot = await this.getSnapshot();
    return buildReport(snapshot, period);
  },

  async getCompactContext(): Promise<string> {
    try {
      const snapshot = await this.getSnapshot();
      return compactContext(snapshot);
    } catch {
      return '';
    }
  },

  /** 供诊断/测试：把快照渲染成人类可读的资料库摘要。 */
  describe(snapshot: AssistantSnapshot): string {
    return [
      compactContext(snapshot),
      `库存成本 ${formatMoney(snapshot.inventory.stockValueCost)}，零售价值 ${formatMoney(
        snapshot.inventory.stockValueRetail
      )}`,
    ].join('\n');
  },
};

export type { AssistantSnapshot };
