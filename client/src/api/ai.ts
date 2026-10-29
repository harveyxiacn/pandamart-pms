import { apiClient, unwrap } from "./client";

export type AssistantMode = "local" | "llm" | "auto";

export type AssistantAlertType =
  | "stockout_risk"
  | "price_spike"
  | "pending_invoice"
  | "expiring_batch"
  | "slow_mover"
  | "payables";

export interface AssistantAlert {
  id: string;
  type: AssistantAlertType;
  severity: "high" | "medium" | "low";
  title: string;
  message: string;
  link: string;
  count?: number;
}

export interface AssistantProduct {
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

export interface AssistantReorderItem {
  productId: number;
  nameEn: string;
  nameZh: string | null;
  sku: string | null;
  quantity: number;
  safeStock: number;
  unit: string;
  deficit: number;
  supplierName: string | null;
  urgency: "high" | "medium" | "low";
  avgWeeklyUsage: number;
  suggestedQuantity: number;
  estimatedCost: number;
  lastPrice: number;
}

export interface AssistantExpiringItem {
  productId: number;
  nameEn: string;
  nameZh: string | null;
  batchNo: string | null;
  expiryDate: string;
  quantity: number;
  expired: boolean;
}

export interface AssistantWindow {
  days: number;
  sales: {
    revenue: number;
    cost: number;
    grossProfit: number;
    margin: number;
    orderCount: number;
  };
  purchase: { totalAmount: number; invoiceCount: number };
}

export interface AssistantSnapshot {
  generatedAt: string;
  source: "live-db";
  inventory: {
    productCount: number;
    totalUnits: number;
    lowStockCount: number;
    zeroStockCount: number;
    stockValueCost: number;
    stockValueRetail: number;
    lowStock: Array<{
      productId: number;
      nameEn: string;
      nameZh: string | null;
      sku: string | null;
      quantity: number;
      safeStock: number;
      unit: string;
      deficit: number;
      supplierName: string | null;
      urgency: "high" | "medium" | "low";
    }>;
    products: AssistantProduct[];
  };
  windows: AssistantWindow[];
  sales: {
    topProducts: Array<{
      productId: number;
      nameEn: string;
      nameZh: string | null;
      revenue: number;
      profit: number;
      qty: number;
    }>;
    slowMovers: Array<{
      productId: number;
      nameEn: string;
      nameZh: string | null;
      currentStock: number;
      soldQty: number;
    }>;
    slowMoverDays: number;
  };
  purchase: {
    pendingCount: number;
    pendingOverdueCount: number;
    topSuppliers: Array<{
      supplierId: number;
      supplierName: string;
      totalAmount: number;
      invoiceCount: number;
    }>;
    topProducts: Array<{
      productId: number;
      nameEn: string;
      nameZh: string | null;
      totalQuantity: number;
      totalAmount: number;
      avgPrice: number;
    }>;
    priceChanges: Array<{
      productId: number;
      nameEn: string;
      nameZh: string | null;
      previousPrice: number;
      currentPrice: number;
      changePercent: number;
      supplierName: string | null;
    }>;
    priceThreshold: number;
  };
  expiring: {
    days: number;
    expiredCount: number;
    expiringCount: number;
    items: AssistantExpiringItem[];
  };
  reorder: AssistantReorderItem[];
  payables: {
    totalOutstanding: number;
    count: number;
    items: Array<{
      supplierId: number;
      supplierName: string;
      outstanding: number;
      invoiceCount: number;
      lastInvoiceDate: string | null;
    }>;
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
    reorderTop: AssistantReorderItem[];
    expiringTop: AssistantExpiringItem[];
    topSuppliers: AssistantSnapshot["purchase"]["topSuppliers"];
    topProducts: AssistantSnapshot["sales"]["topProducts"];
  };
}

export interface AssistantStatus {
  mode: AssistantMode;
  llmConfigured: boolean;
  provider: { name: string; model: string } | null;
  localReady: boolean;
  snapshotTtlSeconds: number;
}

export interface AssistantChatResult {
  conversationId: string;
  reply: string;
  engine: "local" | "llm";
  mode: AssistantMode;
  llmConfigured: boolean;
  intent?: string;
  confidence?: number;
  windowDays?: number;
  suggestions?: string[];
  sources?: string[];
  snapshotAt?: string;
  alertsCount?: number;
  fallback?: { from: "llm"; reason: string };
  dataUsed: {
    tools: string[];
    tables: string[];
    dateRange: string;
    recordCount: number;
  };
}

export interface AssistantReport {
  period: "week" | "month";
  summary: string;
  alerts: Array<{ type: string; message: string }>;
  generatedAt: string;
}

export function sendAiChat(
  message: string,
  conversationId: string | null,
  mode?: AssistantMode
) {
  return unwrap<AssistantChatResult>(
    apiClient.post("/ai/chat", { message, conversationId, mode })
  );
}

export function getAssistantStatus() {
  return unwrap<AssistantStatus>(apiClient.get("/ai/status"));
}

export function getAssistantKnowledge(refresh = false) {
  return unwrap<AssistantKnowledge>(
    apiClient.get("/ai/knowledge", { params: refresh ? { refresh: 1 } : undefined })
  );
}

export function getAssistantAlerts(refresh = false) {
  return unwrap<AssistantAlert[]>(
    apiClient.get("/ai/alerts", { params: refresh ? { refresh: 1 } : undefined })
  );
}

export function getAssistantReport(period: "week" | "month" = "week") {
  return unwrap<AssistantReport>(apiClient.get("/ai/report", { params: { period } }));
}

// —— 兼容旧调用：LLM 增强的洞察与补货建议 ——
export function getAiInsights(period: "week" | "month" = "week") {
  return unwrap<{
    period: string;
    summary: string;
    alerts: Array<{ type: string; message: string }>;
    generatedAt: string;
  }>(apiClient.get("/ai/insights", { params: { period } }));
}

export function getAiReorderAdvice(categoryId?: number, context?: string) {
  return unwrap<{
    advice: string;
    suggestedItems: Array<{
      productId: number;
      nameZh: string | null;
      suggestedQty: number;
      normalQty: number;
      reason: string;
    }>;
  }>(apiClient.post("/ai/reorder-advice", { categoryId, context }));
}
