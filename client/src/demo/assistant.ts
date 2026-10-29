import type {
  AssistantAlert,
  AssistantChatResult,
  AssistantExpiringItem,
  AssistantKnowledge,
  AssistantProduct,
  AssistantReorderItem,
  AssistantReport,
  AssistantSnapshot,
  AssistantStatus,
} from "../api/ai";
import type { DemoDb } from "./seed";

/* ------------------------------------------------------------------ */
/* In-browser local assistant for the public demo.                    */
/*                                                                    */
/* The real app builds this snapshot on the server from MySQL. The     */
/* GitHub Pages build has no server, so the same idea is implemented   */
/* here against the deterministic demo dataset in localStorage. It is  */
/* deliberately a small rule engine: keyword intent + live aggregation */
/* + authored answers — no LLM, no network.                           */
/* ------------------------------------------------------------------ */

type Row = Record<string, any>;

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n: number, size: number) => String(n).padStart(size, "0");

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

function keyShift(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

function todayKey(): string {
  return keyShift(0);
}

function dateKey(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

function formatMoney(value: number): string {
  return `$${round2(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number): string {
  const rounded = round2(value);
  return Number.isInteger(rounded) ? rounded.toLocaleString("en-US") : rounded.toFixed(2);
}

function formatPercent(value: number): string {
  return `${(Math.round((Number(value) || 0) * 10) / 10).toFixed(1)}%`;
}

function label(item: { nameEn: string; nameZh?: string | null }): string {
  if (item.nameZh && item.nameEn && item.nameZh !== item.nameEn) {
    return `${item.nameZh}（${item.nameEn}）`;
  }
  return item.nameZh || item.nameEn;
}

function localDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${localDateKey(d)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}

function productOf(db: DemoDb, id: unknown): Row | undefined {
  return db.products.find((p) => Number(p.id) === Number(id));
}

function supplierNameOf(db: DemoDb, id: unknown): string | null {
  return db.suppliers.find((s) => Number(s.id) === Number(id))?.name ?? null;
}

function orderItems(db: DemoDb, order: Row): Row[] {
  return db.salesItems.filter((item) => Number(item.sales_order_id) === Number(order.id));
}

function buildSnapshot(db: DemoDb): AssistantSnapshot {
  const today = todayKey();
  const cutoff90 = keyShift(-90);
  const cutoff30 = keyShift(-30);
  const cutoff28 = keyShift(-28);
  const cutoff14 = keyShift(14);

  const productIndex: AssistantProduct[] = db.products
    .filter((p) => !p.deleted_at)
    .map((p) => {
      const inv = db.inventory.find((row) => Number(row.product_id) === Number(p.id));
      return {
        productId: Number(p.id),
        nameEn: p.name_en,
        nameZh: p.name_zh ?? null,
        sku: p.sku ?? null,
        barcode: p.barcode ?? null,
        quantity: Number(inv?.quantity ?? 0),
        safeStock:
          inv?.safe_stock === null || inv?.safe_stock === undefined
            ? null
            : Number(inv.safe_stock),
        unit: inv?.unit ?? p.default_unit ?? "Case",
        supplierName: p.supplier_name ?? supplierNameOf(db, p.default_supplier_id),
        defaultPrice: p.default_price === null ? null : Number(p.default_price),
        sellingPrice: p.selling_price === null ? null : Number(p.selling_price),
      };
    });

  const lowStockBase = productIndex
    .filter((p) => p.safeStock !== null && p.quantity < p.safeStock)
    .map((p) => {
      const safeStock = Number(p.safeStock);
      const deficit = round2(safeStock - p.quantity);
      const urgency: "high" | "medium" | "low" =
        p.quantity <= 0 || p.quantity < safeStock / 2 ? "high" : "medium";
      return { ...p, safeStock, deficit, urgency };
    })
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.urgency] - rank[b.urgency] || b.deficit - a.deficit;
    });

  const soldLast28 = new Map<number, number>();
  const completedOrders = db.salesOrders.filter((order) => order.status === "completed");
  for (const order of completedOrders) {
    if (dateKey(order.created_at) < cutoff28) continue;
    for (const item of orderItems(db, order)) {
      soldLast28.set(
        Number(item.product_id),
        (soldLast28.get(Number(item.product_id)) || 0) + Number(item.quantity)
      );
    }
  }

  const reorder: AssistantReorderItem[] = lowStockBase.slice(0, 60).map((item) => {
    const avgWeeklyUsage = round2((soldLast28.get(item.productId) || 0) / 4);
    const suggestedQuantity = Math.max(item.deficit, Math.ceil(avgWeeklyUsage * 1.5));
    const lastPrice = Number(item.defaultPrice || 0);
    return {
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
      avgWeeklyUsage,
      suggestedQuantity,
      estimatedCost: round2(suggestedQuantity * lastPrice),
      lastPrice,
    };
  });

  const expiringItems: AssistantExpiringItem[] = db.batches
    .filter(
      (batch) =>
        batch.status === "active" &&
        Number(batch.quantity) > 0 &&
        batch.expiry_date &&
        dateKey(batch.expiry_date) <= cutoff14
    )
    .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)))
    .slice(0, 60)
    .map((batch) => {
      const product = productOf(db, batch.product_id);
      return {
        productId: Number(batch.product_id),
        nameEn: product?.name_en ?? `商品 #${batch.product_id}`,
        nameZh: product?.name_zh ?? null,
        batchNo: batch.batch_no ?? null,
        expiryDate: dateKey(batch.expiry_date),
        quantity: Number(batch.quantity),
        expired: dateKey(batch.expiry_date) < today,
      };
    });

  const salesWindows = [1, 7, 30, 90].map((days) => {
    const cutoff = keyShift(-(days - 1));
    const orders = completedOrders.filter((order) => dateKey(order.created_at) >= cutoff);
    const orderIds = new Set(orders.map((order) => Number(order.id)));
    const items = db.salesItems.filter((item) => orderIds.has(Number(item.sales_order_id)));
    const revenue = round2(
      items.reduce((sum, item) => sum + Number(item.line_total), 0)
    );
    const cost = round2(
      items.reduce(
        (sum, item) => sum + Number(item.cost_price ?? 0) * Number(item.quantity),
        0
      )
    );
    const grossProfit = round2(revenue - cost);
    return {
      days,
      sales: {
        revenue,
        cost,
        grossProfit,
        margin: revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
        orderCount: orders.length,
      },
      purchase: { totalAmount: 0, invoiceCount: 0 },
    };
  });

  const confirmedInvoices = db.invoices.filter((inv) => inv.status === "confirmed");
  for (const window of salesWindows) {
    const cutoff = keyShift(-(window.days - 1));
    const rows = confirmedInvoices.filter((inv) => dateKey(inv.invoice_date) >= cutoff);
    window.purchase = {
      totalAmount: round2(rows.reduce((sum, inv) => sum + Number(inv.grand_total), 0)),
      invoiceCount: rows.length,
    };
  }

  const confirmedIds30 = new Set(
    confirmedInvoices
      .filter((inv) => dateKey(inv.invoice_date) >= cutoff30)
      .map((inv) => Number(inv.id))
  );

  const productSales = new Map<number, { revenue: number; profit: number; qty: number }>();
  const completedIds30 = new Set(
    completedOrders
      .filter((order) => dateKey(order.created_at) >= cutoff30)
      .map((order) => Number(order.id))
  );
  for (const item of db.salesItems) {
    if (!completedIds30.has(Number(item.sales_order_id))) continue;
    const id = Number(item.product_id);
    const group = productSales.get(id) ?? { revenue: 0, profit: 0, qty: 0 };
    const revenue = Number(item.line_total);
    const cost = Number(item.cost_price ?? 0) * Number(item.quantity);
    group.revenue += revenue;
    group.profit += revenue - cost;
    group.qty += Number(item.quantity);
    productSales.set(id, group);
  }
  const topProducts = Array.from(productSales.entries())
    .map(([productId, group]) => {
      const product = productOf(db, productId);
      return {
        productId,
        nameEn: product?.name_en ?? `商品 #${productId}`,
        nameZh: product?.name_zh ?? null,
        revenue: round2(group.revenue),
        profit: round2(group.profit),
        qty: round2(group.qty),
      };
    })
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  const slowMovers = productIndex
    .filter((product) => product.quantity > 0)
    .map((product) => {
      const group = productSales.get(product.productId);
      return {
        productId: product.productId,
        nameEn: product.nameEn,
        nameZh: product.nameZh,
        currentStock: product.quantity,
        soldQty: group ? group.qty : 0,
      };
    })
    .sort((a, b) => a.soldQty - b.soldQty || b.currentStock - a.currentStock)
    .slice(0, 10);

  const purchaseGroups = new Map<
    number,
    { supplierId: number; supplierName: string; totalAmount: number; invoiceCount: number }
  >();
  for (const invoice of confirmedInvoices) {
    if (dateKey(invoice.invoice_date) < cutoff30 || !invoice.supplier_id) continue;
    const id = Number(invoice.supplier_id);
    const group = purchaseGroups.get(id) ?? {
      supplierId: id,
      supplierName: invoice.supplier_name ?? supplierNameOf(db, id) ?? `#${id}`,
      totalAmount: 0,
      invoiceCount: 0,
    };
    group.totalAmount = round2(group.totalAmount + Number(invoice.grand_total));
    group.invoiceCount += 1;
    purchaseGroups.set(id, group);
  }
  const topSuppliers = Array.from(purchaseGroups.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 6);

  const purchaseProducts = new Map<
    number,
    { totalQuantity: number; totalAmount: number; priceSum: number; count: number }
  >();
  for (const item of db.invoiceItems) {
    if (!confirmedIds30.has(Number(item.invoice_id)) || !item.product_id) continue;
    const id = Number(item.product_id);
    const group = purchaseProducts.get(id) ?? {
      totalQuantity: 0,
      totalAmount: 0,
      priceSum: 0,
      count: 0,
    };
    group.totalQuantity += Number(item.quantity);
    group.totalAmount += Number(item.line_total);
    group.priceSum += Number(item.unit_price);
    group.count += 1;
    purchaseProducts.set(id, group);
  }
  const topPurchaseProducts = Array.from(purchaseProducts.entries())
    .map(([productId, group]) => {
      const product = productOf(db, productId);
      return {
        productId,
        nameEn: product?.name_en ?? `商品 #${productId}`,
        nameZh: product?.name_zh ?? null,
        totalQuantity: round2(group.totalQuantity),
        totalAmount: round2(group.totalAmount),
        avgPrice: round2(group.priceSum / Math.max(1, group.count)),
      };
    })
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, 10);

  // Latest two confirmed unit prices per product (last 90 days)
  const priceByProduct = new Map<number, Row[]>();
  for (const invoice of confirmedInvoices) {
    if (dateKey(invoice.invoice_date) < cutoff90) continue;
    for (const item of db.invoiceItems) {
      if (Number(item.invoice_id) !== Number(invoice.id) || !item.product_id) continue;
      const id = Number(item.product_id);
      const list = priceByProduct.get(id) ?? [];
      list.push({
        date: dateKey(invoice.invoice_date),
        unitPrice: Number(item.unit_price),
        supplierName: invoice.supplier_name ?? null,
        createdAt: invoice.created_at,
      });
      priceByProduct.set(id, list);
    }
  }
  const thresholdRaw = Number(db.settings.price_alert_threshold ?? 0.1);
  const thresholdPercent =
    Number.isFinite(thresholdRaw) && thresholdRaw > 0
      ? thresholdRaw <= 1
        ? round2(thresholdRaw * 100)
        : thresholdRaw
      : 10;

  const priceChanges = Array.from(priceByProduct.entries())
    .map(([productId, entries]) => {
      entries.sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) ||
          String(a.createdAt).localeCompare(String(b.createdAt))
      );
      const current = entries[entries.length - 1];
      const previous = entries[entries.length - 2];
      if (!current || !previous || previous.unitPrice <= 0) return null;
      const changePercent = round2(
        ((current.unitPrice - previous.unitPrice) / previous.unitPrice) * 100
      );
      if (Math.abs(changePercent) < thresholdPercent) return null;
      const product = productOf(db, productId);
      return {
        productId,
        nameEn: product?.name_en ?? `商品 #${productId}`,
        nameZh: product?.name_zh ?? null,
        previousPrice: round2(previous.unitPrice),
        currentPrice: round2(current.unitPrice),
        changePercent,
        supplierName: current.supplierName,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 15);

  const pending = db.invoices.filter((inv) => inv.status === "pending");
  const pendingOverdue = pending.filter((inv) => {
    const created = new Date(inv.created_at);
    return !Number.isNaN(created.getTime()) && Date.now() - created.getTime() > 3 * 86400000;
  });

  const billed = new Map<number, { amount: number; count: number; last: string | null }>();
  for (const invoice of confirmedInvoices) {
    if (!invoice.supplier_id) continue;
    const id = Number(invoice.supplier_id);
    const group = billed.get(id) ?? { amount: 0, count: 0, last: null };
    group.amount += Number(invoice.grand_total);
    group.count += 1;
    const invoiceDate = dateKey(invoice.invoice_date);
    if (!group.last || invoiceDate > group.last) group.last = invoiceDate;
    billed.set(id, group);
  }
  const paid = new Map<number, number>();
  for (const payment of db.payments) {
    const id = Number(payment.supplier_id);
    paid.set(id, (paid.get(id) || 0) + Number(payment.amount));
  }
  const payableItems = Array.from(billed.entries())
    .map(([supplierId, group]) => ({
      supplierId,
      supplierName: supplierNameOf(db, supplierId) ?? `#${supplierId}`,
      outstanding: round2(group.amount - (paid.get(supplierId) || 0)),
      invoiceCount: group.count,
      lastInvoiceDate: group.last,
    }))
    .filter((item) => item.outstanding > 0.009)
    .sort((a, b) => b.outstanding - a.outstanding);

  const inventoryAggregate = productIndex.reduce(
    (acc, product) => {
      acc.totalUnits += product.quantity;
      acc.stockValueCost += product.quantity * Number(product.defaultPrice || 0);
      acc.stockValueRetail += product.quantity * Number(product.sellingPrice || 0);
      if (product.quantity <= 0) acc.zeroStockCount += 1;
      return acc;
    },
    {
      totalUnits: 0,
      stockValueCost: 0,
      stockValueRetail: 0,
      zeroStockCount: 0,
    }
  );

  return {
    generatedAt: new Date().toISOString(),
    source: "live-db",
    inventory: {
      productCount: productIndex.length,
      totalUnits: round2(inventoryAggregate.totalUnits),
      lowStockCount: lowStockBase.length,
      zeroStockCount: inventoryAggregate.zeroStockCount,
      stockValueCost: round2(inventoryAggregate.stockValueCost),
      stockValueRetail: round2(inventoryAggregate.stockValueRetail),
      lowStock: lowStockBase.slice(0, 30),
      products: productIndex,
    },
    windows: salesWindows,
    sales: {
      topProducts,
      slowMovers,
      slowMoverDays: 30,
    },
    purchase: {
      pendingCount: pending.length,
      pendingOverdueCount: pendingOverdue.length,
      topSuppliers,
      topProducts: topPurchaseProducts,
      priceChanges: priceChanges as any,
      priceThreshold: thresholdPercent,
    },
    expiring: {
      days: 14,
      expiredCount: expiringItems.filter((item) => item.expired).length,
      expiringCount: expiringItems.filter((item) => !item.expired).length,
      items: expiringItems,
    },
    reorder,
    payables: {
      totalOutstanding: round2(
        payableItems.reduce((sum, item) => sum + item.outstanding, 0)
      ),
      count: payableItems.length,
      items: payableItems,
    },
  };
}

function deriveAlerts(snapshot: AssistantSnapshot): AssistantAlert[] {
  const alerts: AssistantAlert[] = [];
  const { inventory, expiring, purchase, payables, sales } = snapshot;

  if (inventory.lowStockCount > 0) {
    alerts.push({
      id: "low-stock",
      type: "stockout_risk",
      severity: inventory.zeroStockCount > 0 ? "high" : "medium",
      title: "库存不足",
      message:
        inventory.zeroStockCount > 0
          ? `${inventory.lowStockCount} 个商品低于安全库存，其中 ${inventory.zeroStockCount} 个已缺货`
          : `${inventory.lowStockCount} 个商品低于安全库存，请及时补货`,
      link: "/inventory",
      count: inventory.lowStockCount,
    });
  }
  if (expiring.expiredCount > 0) {
    alerts.push({
      id: "expired-batches",
      type: "expiring_batch",
      severity: "high",
      title: "过期批次",
      message: `${expiring.expiredCount} 个批次已过期，请尽快下架并报损`,
      link: "/batches",
      count: expiring.expiredCount,
    });
  }
  if (expiring.expiringCount > 0) {
    alerts.push({
      id: "expiring-batches",
      type: "expiring_batch",
      severity: expiring.expiringCount > 3 ? "medium" : "low",
      title: "临期批次",
      message: `${expiring.expiringCount} 个批次将在 ${expiring.days} 天内到期`,
      link: "/batches",
      count: expiring.expiringCount,
    });
  }
  if (purchase.pendingCount > 0) {
    alerts.push({
      id: "pending-invoices",
      type: "pending_invoice",
      severity: purchase.pendingOverdueCount > 0 ? "high" : "medium",
      title: "待处理发票",
      message:
        purchase.pendingOverdueCount > 0
          ? `${purchase.pendingCount} 张发票待确认，其中 ${purchase.pendingOverdueCount} 张已超过 3 天`
          : `${purchase.pendingCount} 张发票等待确认入库`,
      link: "/invoices?status=pending",
      count: purchase.pendingCount,
    });
  }
  const increases = purchase.priceChanges.filter((item) => item.changePercent > 0);
  if (increases.length > 0) {
    alerts.push({
      id: "price-increase",
      type: "price_spike",
      severity: "medium",
      title: "采购价格上涨",
      message: `${increases.length} 个商品近期采购价上涨超过 ${purchase.priceThreshold}%`,
      link: "/analytics",
      count: increases.length,
    });
  }
  if (payables.totalOutstanding > 0) {
    alerts.push({
      id: "payables",
      type: "payables",
      severity: "low",
      title: "应付未结",
      message: `${payables.count} 家供应商尚有 ${formatMoney(
        payables.totalOutstanding
      )} 货款未结清`,
      link: "/payables",
      count: payables.count,
    });
  }
  const zeroSales = sales.slowMovers.filter((item) => item.soldQty === 0);
  if (zeroSales.length > 0) {
    alerts.push({
      id: "slow-movers",
      type: "slow_mover",
      severity: "low",
      title: "滞销商品",
      message: `${zeroSales.length} 个商品近 ${sales.slowMoverDays} 天零销量，占用库存资金`,
      link: "/analytics",
      count: zeroSales.length,
    });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function knowledgeText(snapshot: AssistantSnapshot): string {
  const w7 = snapshot.windows.find((item) => item.days === 7)!;
  const w30 = snapshot.windows.find((item) => item.days === 30)!;
  return [
    `资料库快照 ${localDateTime(snapshot.generatedAt)}（演示数据）`,
    `库存：${snapshot.inventory.productCount} 个商品，低库存 ${snapshot.inventory.lowStockCount}（缺货 ${snapshot.inventory.zeroStockCount}）`,
    `临期/过期：过期 ${snapshot.expiring.expiredCount}、临期 ${snapshot.expiring.expiringCount}`,
    `销售近7天：${w7.sales.orderCount}单 ${formatMoney(w7.sales.revenue)}；近30天 ${w30.sales.orderCount}单 ${formatMoney(w30.sales.revenue)}`,
    `采购近30天：${w30.purchase.invoiceCount}张 ${formatMoney(w30.purchase.totalAmount)}`,
    `应付未结：${formatMoney(snapshot.payables.totalOutstanding)}`,
    `补货 TOP：${snapshot.reorder
      .slice(0, 5)
      .map((item) => `${label(item)} +${formatQty(item.suggestedQuantity)}${item.unit}`)
      .join("；")}`,
  ].join("\n");
}

export function demoKnowledge(db: DemoDb): AssistantKnowledge {
  const snapshot = buildSnapshot(db);
  const w7 = snapshot.windows.find((item) => item.days === 7)!;
  const w30 = snapshot.windows.find((item) => item.days === 30)!;
  return {
    snapshot,
    alerts: deriveAlerts(snapshot),
    knowledgeText: knowledgeText(snapshot),
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
}

export function demoAssistantStatus(): AssistantStatus {
  return {
    mode: "local",
    llmConfigured: false,
    provider: null,
    localReady: true,
    snapshotTtlSeconds: 60,
  };
}

/* ── intent parsing ─────────────────────────────────────────── */

const STOPWORDS = new Set([
  "商品",
  "产品",
  "库存",
  "销售",
  "采购",
  "供应商",
  "发票",
  "批次",
  "价格",
  "毛利",
  "利润",
  "还有",
  "多少",
  "剩余",
  "剩下",
  "现在",
  "最近",
  "今天",
  "本周",
  "本月",
  "怎么",
  "怎么样",
  "如何",
  "哪些",
  "哪个",
  "什么",
  "需要",
  "补货",
  "可以",
  "帮我",
  "一下",
  "临期",
  "过期",
  "滞销",
  "涨价",
  "降价",
  "应付",
  "欠款",
  "经营",
  "情况",
]);

function tokensOf(message: string): string[] {
  const tokens = new Set<string>();
  const cleaned = message
    .toLowerCase()
    .replace(/[，。！？、,.!?;；:："“”'‘’()（）[\]【】\s]/g, " ");
  for (const word of cleaned.match(/[a-z0-9][a-z0-9-]{2,}/g) || []) {
    tokens.add(word);
  }
  for (const chunk of cleaned.match(/[一-龥]{2,}/g) || []) {
    for (let length = Math.min(6, chunk.length); length >= 2; length--) {
      for (let start = 0; start + length <= chunk.length; start++) {
        tokens.add(chunk.slice(start, start + length));
      }
    }
  }
  return Array.from(tokens).filter((token) => !STOPWORDS.has(token));
}

function matchProduct(
  message: string,
  products: AssistantProduct[]
): AssistantProduct | undefined {
  const text = message.toLowerCase();
  const tokens = tokensOf(message);
  let best: AssistantProduct | undefined;
  let bestScore = 0;
  for (const product of products) {
    const candidates = [
      product.nameZh?.toLowerCase(),
      product.nameEn.toLowerCase(),
      product.sku?.toLowerCase(),
      product.barcode?.toLowerCase(),
    ].filter((value): value is string => Boolean(value && value.length >= 2));
    for (const candidate of candidates) {
      let score = 0;
      if (text.includes(candidate)) score = 1500 + candidate.length;
      else {
        for (const token of tokens) {
          if (candidate.includes(token)) {
            score = Math.max(
              score,
              500 + token.length * 10 - Math.abs(candidate.length - token.length) * 0.1
            );
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

function parseDays(message: string): number {
  const text = message.toLowerCase();
  const explicit = text.match(/(?:最近|近|过去|前)\s*(\d{1,3})\s*(?:个)?(?:天|日|days?)/);
  if (explicit) return Math.min(365, Math.max(1, Number(explicit[1])));
  const english = text.match(/(?:last|past)\s*(\d{1,3})\s*days?/);
  if (english) return Math.min(365, Math.max(1, Number(english[1])));
  if (/今天|今日|today/.test(text)) return 1;
  if (/本周|这周|this week/.test(text)) {
    const d = new Date();
    const dow = d.getDay();
    return dow === 0 ? 7 : dow;
  }
  if (/本月|这个月|this month/.test(text)) return new Date().getDate();
  if (/季度|quarter/.test(text)) return 90;
  return 30;
}

function pickWindow(days: number): 1 | 7 | 30 | 90 {
  if (days <= 1) return 1;
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  return 90;
}

type IntentName =
  | "greeting"
  | "help"
  | "overview"
  | "alerts"
  | "low_stock"
  | "reorder"
  | "expiring"
  | "sales"
  | "profit"
  | "purchase"
  | "price_change"
  | "supplier"
  | "payables"
  | "slow_mover"
  | "pending_invoice"
  | "product_lookup"
  | "unknown";

interface Intent {
  name: IntentName;
  window: 1 | 7 | 30 | 90;
  product?: AssistantProduct;
}

function parseIntent(message: string, products: AssistantProduct[]): Intent {
  const text = message.toLowerCase();
  const window = pickWindow(parseDays(message));
  const product = matchProduct(message, products);
  const out = (name: IntentName): Intent => ({ name, window, product });

  if (/^(你好|您好|嗨|hello|hi|hey)[!！。.?\s]*$/.test(text)) return out("greeting");
  if (/能做什么|你会什么|怎么用|帮助|help|what can you do/.test(text)) return out("help");

  const rules: Array<[IntentName, RegExp]> = [
    ["expiring", /临期|过期|到期|保质期|expir/],
    ["alerts", /预警|告警|风险|异常|需要关注|alert|warning/],
    ["payables", /应付|欠款|还欠|欠多少|未付|未结|账款|payable|owed/],
    ["price_change", /涨价|降价|价格波动|价格变化|进价|采购价|price change|cost increase/],
    ["slow_mover", /滞销|卖不动|不动销|slow.?mov/],
    ["profit", /毛利|利润|赚了多少|盈利|profit|margin/],
    ["sales", /销售|营业额|营收|收入|流水|卖了多少|sales|revenue/],
    ["supplier", /供应商|supplier|vendor/],
    ["pending_invoice", /发票|待审核|待确认|invoice|pending/],
    ["reorder", /补货|订货|进货建议|该进什么|买什么|reorder|restock/],
    ["low_stock", /缺货|断货|库存不足|低于安全|安全库存|low stock|stockout/],
    ["purchase", /采购|进货|买入|purchase|spend/],
    ["overview", /库存|仓库|概览|总体|经营情况|overview|summary|dashboard/],
  ];

  for (const [name, pattern] of rules) {
    if (!pattern.test(text)) continue;
    if (
      product &&
      (name === "overview" || name === "low_stock") &&
      /还有多少|剩多少|有多少|够不够|库存|查一下|看看/.test(text)
    ) {
      return out("product_lookup");
    }
    return out(name);
  }
  if (product) return out("product_lookup");
  return out("unknown");
}

/* ── answers ───────────────────────────────────────────────── */

function windowOf(snapshot: AssistantSnapshot, days: number) {
  return snapshot.windows.find((item) => item.days === days) || snapshot.windows[2];
}

function productStatus(product: AssistantProduct): string {
  if (product.safeStock === null) {
    return `当前库存 ${formatQty(product.quantity)} ${product.unit}（未设置安全库存）`;
  }
  const deficit = round2(product.safeStock - product.quantity);
  if (product.quantity <= 0) {
    return `当前库存 0 ${product.unit}，已缺货（安全库存 ${formatQty(product.safeStock)} ${product.unit}）`;
  }
  if (deficit > 0) {
    return `当前库存 ${formatQty(product.quantity)} ${product.unit}，低于安全库存 ${formatQty(
      product.safeStock
    )} ${product.unit}，缺口 ${formatQty(deficit)} ${product.unit}`;
  }
  return `当前库存 ${formatQty(product.quantity)} ${product.unit}，高于安全库存 ${formatQty(
    product.safeStock
  )} ${product.unit}`;
}

function overview(snapshot: AssistantSnapshot): string {
  const w7 = windowOf(snapshot, 7);
  const w30 = windowOf(snapshot, 30);
  return [
    `当前资料库（${localDateTime(snapshot.generatedAt)} 同步，数据来自演示仓库）：`,
    `库存：${snapshot.inventory.productCount} 个商品，总库存 ${formatQty(
      snapshot.inventory.totalUnits
    )} 件，库存成本约 ${formatMoney(snapshot.inventory.stockValueCost)}，零售价值约 ${formatMoney(
      snapshot.inventory.stockValueRetail
    )}`,
    `预警：${snapshot.inventory.lowStockCount} 个商品低于安全线（${snapshot.inventory.zeroStockCount} 个已缺货）；${snapshot.expiring.expiredCount} 个批次过期、${snapshot.expiring.expiringCount} 个 ${snapshot.expiring.days} 天内临期`,
    `销售：近 7 天 ${w7.sales.orderCount} 单 / ${formatMoney(
      w7.sales.revenue
    )}，毛利率 ${formatPercent(w7.sales.margin)}；近 30 天 ${w30.sales.orderCount} 单 / ${formatMoney(
      w30.sales.revenue
    )}`,
    `采购：近 30 天 ${w30.purchase.invoiceCount} 张已确认发票 / ${formatMoney(
      w30.purchase.totalAmount
    )}；待确认发票 ${snapshot.purchase.pendingCount} 张`,
    `应付：${snapshot.payables.count} 家供应商未结 ${formatMoney(snapshot.payables.totalOutstanding)}`,
  ].join("\n");
}

function reorderText(snapshot: AssistantSnapshot, product?: AssistantProduct): string {
  let items = snapshot.reorder;
  if (product) {
    items = items.filter((item) => item.productId === product.productId);
  }
  if (items.length === 0) {
    return product
      ? `${label(product)} 当前不需要补货，库存高于安全线。`
      : "当前所有商品都高于安全库存，暂时不需要补货。可以继续关注临期批次和滞销库存。";
  }
  const lines = product
    ? [`${label(product)} 的补货建议：`]
    : [`补货建议（按缺口与近 4 周销量估算，共 ${snapshot.reorder.length} 项）：`];
  for (const [index, item] of items.slice(0, 8).entries()) {
    lines.push(
      `${index + 1}. ${label(item)}：现有 ${formatQty(item.quantity)} / 安全线 ${formatQty(
        item.safeStock
      )} ${item.unit}，周均销量 ${formatQty(item.avgWeeklyUsage)}，建议进 ${formatQty(
        item.suggestedQuantity
      )} ${item.unit}（约 ${formatMoney(item.estimatedCost)}）${
        item.supplierName ? `，供应商 ${item.supplierName}` : ""
      }`
    );
  }
  lines.push("");
  lines.push("建议先确认供应商到货周期，并按保质期安排先进先出。");
  return lines.join("\n");
}

function expiringText(snapshot: AssistantSnapshot): string {
  if (snapshot.expiring.items.length === 0) {
    return `未来 ${snapshot.expiring.days} 天内没有临期或过期批次，保质期状态良好。`;
  }
  const today = dateKey(snapshot.generatedAt);
  const lines = [
    `临期/过期批次：已过期 ${snapshot.expiring.expiredCount} 个，${snapshot.expiring.days} 天内到期 ${snapshot.expiring.expiringCount} 个。`,
  ];
  for (const item of snapshot.expiring.items.slice(0, 8)) {
    const left = Math.round(
      (new Date(`${item.expiryDate}T00:00:00`).getTime() -
        new Date(`${today}T00:00:00`).getTime()) /
        86400000
    );
    lines.push(
      `- ${label(item)}${item.batchNo ? ` 批次 ${item.batchNo}` : ""}：到期 ${item.expiryDate}，剩余 ${formatQty(
        item.quantity
      )}，${left < 0 ? `已过期 ${Math.abs(left)} 天` : left === 0 ? "今天到期" : `还剩 ${left} 天`}`
    );
  }
  lines.push("");
  lines.push("建议：已过期商品立即下架报损；3 天内到期的商品优先促销或做捆绑销售。");
  return lines.join("\n");
}

function salesText(snapshot: AssistantSnapshot, days: number, profitOnly: boolean): string {
  const metrics = windowOf(snapshot, days);
  const top = [...snapshot.sales.topProducts]
    .sort((a, b) => (profitOnly ? b.profit - a.profit : b.revenue - a.revenue))
    .slice(0, 5);
  const lines = [
    profitOnly ? `近 ${metrics.days} 天毛利概览：` : `近 ${metrics.days} 天销售：`,
    `- 完成订单：${metrics.sales.orderCount} 单`,
    `- 销售额：${formatMoney(metrics.sales.revenue)}`,
    `- 销售成本：${formatMoney(metrics.sales.cost)}`,
    `- 毛利：${formatMoney(metrics.sales.grossProfit)}（毛利率 ${formatPercent(
      metrics.sales.margin
    )}）`,
  ];
  if (top.length > 0) {
    lines.push("");
    lines.push(profitOnly ? "毛利贡献前 5：" : "销售额贡献前 5：");
    for (const [index, item] of top.entries()) {
      lines.push(
        `${index + 1}. ${label(item)}：销售额 ${formatMoney(item.revenue)}，毛利 ${formatMoney(
          item.profit
        )}，销量 ${formatQty(item.qty)}`
      );
    }
  }
  lines.push("");
  lines.push(
    metrics.sales.margin < 20
      ? "毛利率偏低，建议检查售价与采购成本，优先推动高毛利商品。"
      : "毛利率处于正常区间，可保持高毛利商品的库存水位。"
  );
  return lines.join("\n");
}

function purchaseText(snapshot: AssistantSnapshot, days: number): string {
  const metrics = windowOf(snapshot, days);
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
          : ""
      }。`
    );
  }
  if (snapshot.purchase.topSuppliers.length > 0) {
    lines.push("");
    lines.push("采购额前 5 的供应商（近 30 天）：");
    for (const [index, item] of snapshot.purchase.topSuppliers.slice(0, 5).entries()) {
      lines.push(
        `${index + 1}. ${item.supplierName}：${formatMoney(item.totalAmount)}，${item.invoiceCount} 张发票`
      );
    }
  }
  if (snapshot.purchase.topProducts.length > 0) {
    lines.push("");
    lines.push("采购量前 5 的商品（近 30 天）：");
    for (const [index, item] of snapshot.purchase.topProducts.slice(0, 5).entries()) {
      lines.push(
        `${index + 1}. ${label(item)}：${formatQty(item.totalQuantity)}，${formatMoney(
          item.totalAmount
        )}`
      );
    }
  }
  return lines.join("\n");
}

function supplierText(snapshot: AssistantSnapshot): string {
  const lines: string[] = [];
  lines.push(
    snapshot.purchase.topSuppliers.length > 0
      ? "近 30 天供应商采购分布："
      : "近 30 天没有已确认的采购记录。"
  );
  for (const [index, item] of snapshot.purchase.topSuppliers.slice(0, 6).entries()) {
    lines.push(
      `${index + 1}. ${item.supplierName}：${formatMoney(item.totalAmount)}，${item.invoiceCount} 张发票`
    );
  }
  if (snapshot.payables.items.length > 0) {
    lines.push("");
    lines.push(`应付未结 ${formatMoney(snapshot.payables.totalOutstanding)}：`);
    for (const item of snapshot.payables.items.slice(0, 5)) {
      lines.push(
        `- ${item.supplierName}：${formatMoney(item.outstanding)}（${item.invoiceCount} 张发票）`
      );
    }
  }
  return lines.join("\n");
}

function payablesText(snapshot: AssistantSnapshot): string {
  if (snapshot.payables.totalOutstanding <= 0) {
    return "当前没有未结清的供应商应付账款。";
  }
  const lines = [
    `当前应付未结 ${formatMoney(snapshot.payables.totalOutstanding)}，涉及 ${
      snapshot.payables.count
    } 家供应商。`,
    "",
  ];
  for (const item of snapshot.payables.items.slice(0, 8)) {
    lines.push(
      `- ${item.supplierName}：${formatMoney(item.outstanding)}（${item.invoiceCount} 张发票${
        item.lastInvoiceDate ? `，最近 ${item.lastInvoiceDate}` : ""
      }）`
    );
  }
  lines.push("");
  lines.push("建议优先核对金额较大、账期较长的供应商。");
  return lines.join("\n");
}

function priceChangeText(
  snapshot: AssistantSnapshot,
  product?: AssistantProduct
): string {
  let items = snapshot.purchase.priceChanges;
  if (product) items = items.filter((item) => item.productId === product.productId);
  if (items.length === 0) {
    return product
      ? `${label(product)} 近期没有超过 ${snapshot.purchase.priceThreshold}% 的采购价波动。`
      : `近期没有检测到超过 ${snapshot.purchase.priceThreshold}% 的采购价波动，价格整体平稳。`;
  }
  const lines = [
    product
      ? `${label(product)} 的近期采购价变化：`
      : `近期采购价波动（阈值 ${snapshot.purchase.priceThreshold}%）：`,
  ];
  for (const item of items.slice(0, 8)) {
    lines.push(
      `- ${label(item)}：${formatMoney(item.previousPrice)} → ${formatMoney(
        item.currentPrice
      )}（${item.changePercent > 0 ? "+" : ""}${item.changePercent.toFixed(1)}%）${
        item.supplierName ? `，${item.supplierName}` : ""
      }`
    );
  }
  lines.push("");
  lines.push(
    items.some((item) => item.changePercent > 0)
      ? "建议对涨幅较大的商品复核供应商报价，必要时比较替代货源。"
      : "价格整体下降，可结合库存与保质期适度增加采购。"
  );
  return lines.join("\n");
}

function slowMoverText(snapshot: AssistantSnapshot): string {
  if (snapshot.sales.slowMovers.length === 0) {
    return `近 ${snapshot.sales.slowMoverDays} 天没有发现明显滞销商品。`;
  }
  const lines = [`近 ${snapshot.sales.slowMoverDays} 天滞销商品（有库存但销量最低）：`];
  for (const item of snapshot.sales.slowMovers.slice(0, 8)) {
    lines.push(
      `- ${label(item)}：库存 ${formatQty(item.currentStock)}，近 ${snapshot.sales.slowMoverDays} 天销量 ${formatQty(
        item.soldQty
      )}`
    );
  }
  lines.push("");
  lines.push("建议：对零销量商品做促销/捆绑销售，并下调下一次采购量。");
  return lines.join("\n");
}

function pendingText(snapshot: AssistantSnapshot): string {
  if (snapshot.purchase.pendingCount === 0) {
    return "当前没有待确认的发票，入库与应付数据已同步。";
  }
  return [
    `当前有 ${snapshot.purchase.pendingCount} 张发票待确认。`,
    snapshot.purchase.pendingOverdueCount > 0
      ? `其中 ${snapshot.purchase.pendingOverdueCount} 张已超过 3 天，建议优先处理。`
      : "发票确认后才会更新库存与应付账款。",
  ].join("\n");
}

function alertsText(snapshot: AssistantSnapshot): string {
  const alerts = deriveAlerts(snapshot);
  if (alerts.length === 0) {
    return "当前没有发现需要处理的库存或经营预警，各项指标正常。";
  }
  const labels = { high: "紧急", medium: "关注", low: "提示" };
  return [
    `当前共 ${alerts.length} 项预警：`,
    ...alerts.map(
      (alert, index) => `${index + 1}. [${labels[alert.severity]}] ${alert.title}：${alert.message}`
    ),
    "",
    "建议先处理「紧急」项，其余可按模块逐步跟进。",
  ].join("\n");
}

function productText(snapshot: AssistantSnapshot, product: AssistantProduct): string {
  const lines = [
    `${label(product)}${product.sku ? `（SKU: ${product.sku}）` : ""}：`,
    `- ${productStatus(product)}`,
  ];
  if (product.supplierName) lines.push(`- 默认供应商：${product.supplierName}`);
  if (product.defaultPrice !== null) {
    lines.push(`- 采购成本：${formatMoney(product.defaultPrice)} / ${product.unit}`);
  }
  if (product.sellingPrice !== null) {
    lines.push(`- 零售价：${formatMoney(product.sellingPrice)} / ${product.unit}`);
  }
  const change = snapshot.purchase.priceChanges.find((item) => item.productId === product.productId);
  if (change) {
    lines.push(
      `- 近期进价：${formatMoney(change.previousPrice)} → ${formatMoney(
        change.currentPrice
      )}（${change.changePercent > 0 ? "+" : ""}${change.changePercent.toFixed(1)}%）`
    );
  }
  const reorder = snapshot.reorder.find((item) => item.productId === product.productId);
  if (reorder) {
    lines.push(
      `- 建议补货：${formatQty(reorder.suggestedQuantity)} ${product.unit}（周均销量 ${formatQty(
        reorder.avgWeeklyUsage
      )} ${product.unit}）`
    );
  }
  if (product.safeStock !== null && product.quantity <= product.safeStock) {
    lines.push("- 状态：低于安全库存，请尽快安排补货");
  } else {
    lines.push("- 状态：库存充足");
  }
  return lines.join("\n");
}

const SUGGESTIONS: Record<IntentName, string[]> = {
  greeting: ["哪些商品需要补货？", "当前库存预警有哪些？", "近 30 天毛利如何？"],
  help: ["哪些商品需要补货？", "临期批次有哪些？", "供应商应付还有多少？"],
  overview: ["哪些商品需要补货？", "近 7 天销售怎么样？", "库存预警有哪些？"],
  alerts: ["哪些商品需要补货？", "临期批次有哪些？", "待确认发票有多少？"],
  low_stock: ["给我补货建议", "临期商品有哪些？", "近 30 天销售如何？"],
  reorder: ["这些商品分别找哪个供应商？", "当前库存预警有哪些？", "哪些商品滞销？"],
  expiring: ["哪些商品需要补货？", "近 30 天销售如何？", "库存预警有哪些？"],
  sales: ["毛利情况怎么样？", "哪些商品滞销？", "哪些商品需要补货？"],
  profit: ["哪些商品毛利最高？", "采购成本有上涨吗？", "哪些商品滞销？"],
  purchase: ["主要供应商是谁？", "采购价有波动吗？", "待确认发票有多少？"],
  price_change: ["哪些商品涨价最多？", "供应商应付还有多少？", "哪些商品需要补货？"],
  supplier: ["应付账款还有多少？", "近 30 天采购额多少？", "采购价有波动吗？"],
  payables: ["各供应商分别欠多少？", "近 30 天采购额多少？", "哪些发票待确认？"],
  slow_mover: ["近 30 天销售怎么样？", "哪些商品需要补货？", "如何减少库存资金占用？"],
  pending_invoice: ["哪些商品需要补货？", "库存预警有哪些？", "近 30 天采购额多少？"],
  product_lookup: ["这个商品需要补货吗？", "它的采购价有变化吗？", "当前库存预警有哪些？"],
  unknown: ["当前库存情况如何？", "哪些商品需要补货？", "近 30 天毛利如何？"],
};

const SOURCES: Record<IntentName, string[]> = {
  greeting: ["inventory"],
  help: ["inventory"],
  overview: ["inventory", "sales", "purchase", "payables", "batches"],
  alerts: ["inventory", "batches", "purchase", "payables"],
  low_stock: ["inventory"],
  reorder: ["inventory", "sales"],
  expiring: ["inventory_batches"],
  sales: ["sales_orders", "sales_items"],
  profit: ["sales_orders", "sales_items"],
  purchase: ["invoices", "invoice_items", "suppliers"],
  price_change: ["invoices", "invoice_items"],
  supplier: ["invoices", "suppliers", "supplier_payments"],
  payables: ["invoices", "supplier_payments"],
  slow_mover: ["sales_orders", "sales_items", "inventory"],
  pending_invoice: ["invoices"],
  product_lookup: ["inventory", "products", "invoice_items"],
  unknown: ["inventory", "sales"],
};

export function demoAnswer(db: DemoDb, message: string): AssistantChatResult {
  const snapshot = buildSnapshot(db);
  const intent = parseIntent(message, snapshot.inventory.products);
  let reply = "";

  switch (intent.name) {
    case "greeting":
      reply = `你好，我是熊猫超市的本地智能助手。我不依赖 LLM，直接从当前演示资料库回答。\n\n${overview(
        snapshot
      )}\n\n你可以问库存、补货、临期、销售、采购、供应商和应付账款。`;
      break;
    case "help":
      reply = [
        "我可以直接基于当前仓库资料库回答：",
        "- 库存与补货：哪些商品低于安全线、建议进多少、找哪个供应商",
        "- 保质期：哪些批次临期或已过期",
        "- 销售与毛利：近 7/30/90 天销售额、成本、毛利率、畅销商品",
        "- 采购与价格：采购额、主要供应商、进价涨跌",
        "- 应付与发票：欠供应商多少、哪些发票待确认",
        "- 盘点单品：直接说商品名或 SKU，例如「生姜还有多少库存」",
      ].join("\n");
      break;
    case "overview":
      reply = `${overview(snapshot)}\n\n想深入看哪一块？${SUGGESTIONS.overview.join(" / ")}`;
      break;
    case "alerts":
      reply = alertsText(snapshot);
      break;
    case "low_stock":
      reply = intent.product
        ? productText(snapshot, intent.product)
        : snapshot.inventory.lowStock.length === 0
          ? "目前没有商品低于安全库存，库存水位整体健康。"
          : [
              `当前有 ${snapshot.inventory.lowStockCount} 个商品低于安全库存，其中 ${snapshot.inventory.zeroStockCount} 个已缺货。缺口最大的商品：`,
              ...snapshot.inventory.lowStock.slice(0, 8).map(
                (item, index) =>
                  `${index + 1}. ${label(item)}：现有 ${formatQty(item.quantity)} / 安全线 ${formatQty(
                    item.safeStock
                  )} ${item.unit}，缺口 ${formatQty(item.deficit)} ${item.unit}`
              ),
              "",
              "建议：优先补缺口最大和已缺货的商品。",
            ].join("\n");
      break;
    case "reorder":
      reply = reorderText(snapshot, intent.product);
      break;
    case "expiring":
      reply = expiringText(snapshot);
      break;
    case "sales":
      reply = salesText(snapshot, intent.window, false);
      break;
    case "profit":
      reply = salesText(snapshot, intent.window, true);
      break;
    case "purchase":
      reply = purchaseText(snapshot, intent.window);
      break;
    case "price_change":
      reply = priceChangeText(snapshot, intent.product);
      break;
    case "supplier":
      reply = supplierText(snapshot);
      break;
    case "payables":
      reply = payablesText(snapshot);
      break;
    case "slow_mover":
      reply = slowMoverText(snapshot);
      break;
    case "pending_invoice":
      reply = pendingText(snapshot);
      break;
    case "product_lookup":
      reply = intent.product
        ? productText(snapshot, intent.product)
        : overview(snapshot);
      break;
    default:
      reply = `${overview(snapshot)}\n\n我没有完全理解你的问题。可以换个说法，或试试：\n- ${SUGGESTIONS.unknown.join(
        "\n- "
      )}`;
      break;
  }

  return {
    conversationId: `demo-local-${Date.now().toString(36)}`,
    reply,
    engine: "local",
    mode: "local",
    llmConfigured: false,
    intent: intent.name,
    confidence: intent.name === "unknown" ? 0 : 0.9,
    windowDays: intent.window,
    suggestions: SUGGESTIONS[intent.name].slice(0, 3),
    sources: SOURCES[intent.name],
    snapshotAt: snapshot.generatedAt,
    alertsCount: snapshot.inventory.lowStockCount + snapshot.expiring.expiredCount,
    dataUsed: {
      tools: [],
      tables: SOURCES[intent.name],
      dateRange: `近 ${intent.window} 天`,
      recordCount:
        snapshot.inventory.productCount +
        snapshot.purchase.pendingCount +
        snapshot.purchase.topSuppliers.length,
    },
  };
}

export function demoReport(db: DemoDb, period: "week" | "month"): AssistantReport {
  const snapshot = buildSnapshot(db);
  const days = period === "month" ? 30 : 7;
  const window = windowOf(snapshot, days);
  const alerts = deriveAlerts(snapshot);
  const high = alerts.filter((alert) => alert.severity === "high");
  return {
    period,
    summary: [
      `${days === 7 ? "周度" : "月度"}经营简报（${localDateTime(snapshot.generatedAt)}）：`,
      `销售：${window.sales.orderCount} 单，${formatMoney(window.sales.revenue)}，毛利 ${formatMoney(
        window.sales.grossProfit
      )}（毛利率 ${formatPercent(window.sales.margin)}）。`,
      `采购：${window.purchase.invoiceCount} 张已确认发票，${formatMoney(
        window.purchase.totalAmount
      )}；待确认 ${snapshot.purchase.pendingCount} 张。`,
      `库存：${snapshot.inventory.lowStockCount} 个商品低于安全线（${snapshot.inventory.zeroStockCount} 个缺货），${snapshot.expiring.expiredCount} 个批次过期、${snapshot.expiring.expiringCount} 个临期。`,
      `应付：${snapshot.payables.count} 家供应商未结 ${formatMoney(snapshot.payables.totalOutstanding)}。`,
      high.length > 0
        ? `需要优先处理：${high.map((alert) => alert.title).join("、")}。`
        : "本期没有需要紧急处理的风险项。",
    ].join("\n"),
    alerts: alerts.map((alert) => ({
      type: alert.type,
      message: `${alert.title}：${alert.message}`,
    })),
    generatedAt: snapshot.generatedAt,
  };
}
