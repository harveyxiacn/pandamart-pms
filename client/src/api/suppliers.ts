import type { PaginatedData, Supplier } from "../types";
import { apiClient, unwrap } from "./client";
import { fetchAllPages } from "./pagination";

export function getSuppliers(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<PaginatedData<Supplier>>(apiClient.get("/suppliers", { params }));
}

/** 拉取全部供应商（跨页），供选择器使用。 */
export function getAllSuppliers(
  params?: Omit<Record<string, string | number | boolean | undefined>, "page" | "pageSize">
): Promise<Supplier[]> {
  return fetchAllPages<Supplier>((page, pageSize) => getSuppliers({ ...params, page, pageSize }));
}

export function getSupplierById(id: number): Promise<Supplier> {
  return unwrap(apiClient.get(`/suppliers/${id}`));
}

export function createSupplier(payload: Record<string, unknown>): Promise<{ id: number }> {
  return unwrap(apiClient.post("/suppliers", payload));
}

export function updateSupplier(id: number, payload: Record<string, unknown>): Promise<null> {
  return unwrap(apiClient.put(`/suppliers/${id}`, payload));
}

export function deleteSupplier(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/suppliers/${id}`));
}
