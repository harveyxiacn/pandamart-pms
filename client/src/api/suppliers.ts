import type { PaginatedData, Supplier } from "../types";
import { apiClient, unwrap } from "./client";

export function getSuppliers(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<PaginatedData<Supplier>>(apiClient.get("/suppliers", { params }));
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
