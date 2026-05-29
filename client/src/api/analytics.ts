import type { DashboardData } from "../types";
import { apiClient, unwrap } from "./client";

export function getDashboard(): Promise<DashboardData> {
  return unwrap(apiClient.get("/analytics/dashboard"));
}

export function getPurchaseTrend(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<Array<{ date: string; amount: number; invoiceCount: number }>>(
    apiClient.get("/analytics/purchase-trend", { params })
  );
}

export function getProductRanking(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<Array<Record<string, unknown>>>(
    apiClient.get("/analytics/product-ranking", { params })
  );
}

export function getPriceChanges(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<Array<Record<string, unknown>>>(apiClient.get("/analytics/price-changes", { params }));
}

export function getSupplierDistribution(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<Array<{ supplierName: string; totalAmount: number; percentage: number; invoiceCount: number }>>(
    apiClient.get("/analytics/supplier-distribution", { params })
  );
}

export function getCategoryDistribution(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<Array<{ categoryName: string; totalAmount: number; percentage: number; productCount: number }>>(
    apiClient.get("/analytics/category-distribution", { params })
  );
}

export function getReorderSuggestions() {
  return unwrap<Array<Record<string, unknown>>>(apiClient.get("/analytics/reorder-suggestions"));
}

export interface ProfitSummary {
  revenue: number;
  cost: number;
  grossProfit: number;
  margin: number;
  orderCount: number;
  topProducts: Array<{ nameEn: string; nameZh: string | null; revenue: number; profit: number; qty: number }>;
}

export function getProfitSummary(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<ProfitSummary>(apiClient.get("/analytics/profit", { params }));
}

export interface SlowMovers {
  days: number;
  items: Array<{ productId: number; nameEn: string; nameZh: string | null; currentStock: number; soldQty: number }>;
}

export function getSlowMovers(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<SlowMovers>(apiClient.get("/analytics/slow-movers", { params }));
}
