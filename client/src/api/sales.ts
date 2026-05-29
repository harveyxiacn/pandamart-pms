import type { PaginatedData } from "../types";
import { apiClient, unwrap } from "./client";

export interface SaleSummary {
  id: number;
  orderNo: string;
  total: number;
  status: "completed" | "voided";
  note: string | null;
  soldBy: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface SaleItem {
  id: number;
  productId: number;
  nameEn: string;
  nameZh: string | null;
  sku: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  costPrice: number | null;
  lineTotal: number;
}

export interface SaleDetail extends SaleSummary {
  items: SaleItem[];
}

export interface CreateSalePayload {
  items: Array<{ productId: number; quantity: number; unitPrice: number }>;
  note?: string | null;
}

export function getSales(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<PaginatedData<SaleSummary>>(apiClient.get("/sales", { params }));
}

export function getSale(id: number): Promise<SaleDetail> {
  return unwrap(apiClient.get(`/sales/${id}`));
}

export function createSale(payload: CreateSalePayload): Promise<SaleDetail> {
  return unwrap(apiClient.post("/sales", payload));
}

export function voidSale(id: number): Promise<SaleDetail> {
  return unwrap(apiClient.post(`/sales/${id}/void`, {}));
}
