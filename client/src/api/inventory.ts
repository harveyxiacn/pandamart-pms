import type { InventoryItem, InventorySummary, PaginatedData } from "../types";
import { apiClient, unwrap } from "./client";

export function getInventory(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<PaginatedData<InventoryItem> & { summary: InventorySummary }>(
    apiClient.get("/inventory", { params })
  );
}

export function adjustInventory(
  productId: number,
  payload: { type: "adjust" | "out" | "stocktake"; quantity: number; reason?: string }
): Promise<{ before: number; after: number }> {
  return unwrap(apiClient.post(`/inventory/${productId}/adjust`, payload));
}

export function setSafeStock(productId: number, safeStock: number): Promise<null> {
  return unwrap(apiClient.put(`/inventory/${productId}/safe-stock`, { safeStock }));
}

export function getInventoryLogs(
  productId: number,
  params?: Record<string, string | number | boolean | undefined>
): Promise<
  PaginatedData<{
    id: number;
    type: string;
    quantity: number;
    quantityBefore: number;
    quantityAfter: number;
    invoiceNumber: string | null;
    reason: string | null;
    operatedBy: string | null;
    createdAt: string;
  }>
> {
  return unwrap(apiClient.get(`/inventory/${productId}/logs`, { params }));
}

export function submitStocktake(payload: {
  items: Array<{ productId: number; actualQuantity: number; systemQuantity: number; notes: string }>;
  notes: string;
}): Promise<{ adjustedCount: number; results: Array<Record<string, unknown>> }> {
  return unwrap(apiClient.post("/inventory/stocktake", payload));
}
