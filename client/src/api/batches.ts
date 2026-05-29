import type { PaginatedData } from "../types";
import { apiClient, unwrap } from "./client";

export interface Batch {
  id: number;
  productId: number;
  nameEn: string;
  nameZh: string | null;
  sku: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  receivedDate: string | null;
  quantity: number;
  status: "active" | "depleted" | "disposed";
  note: string | null;
  createdAt: string;
}

export interface ExpiringSummary {
  days: number;
  expiredCount: number;
  expiringCount: number;
  items: Array<Batch & { expired: boolean }>;
}

export function getBatches(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<PaginatedData<Batch>>(apiClient.get("/batches", { params }));
}

export function getExpiringBatches(days = 7): Promise<ExpiringSummary> {
  return unwrap(apiClient.get("/batches/expiring", { params: { days } }));
}

export function createBatch(payload: {
  productId: number;
  quantity: number;
  expiryDate?: string | null;
  batchNo?: string | null;
  receivedDate?: string | null;
  note?: string | null;
}): Promise<{ id: number }> {
  return unwrap(apiClient.post("/batches", payload));
}

export function disposeBatch(id: number, payload?: { quantity?: number; reason?: string }): Promise<{ id: number }> {
  return unwrap(apiClient.post(`/batches/${id}/dispose`, payload ?? {}));
}
