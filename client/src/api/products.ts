import type { PaginatedData, Product } from "../types";
import { apiClient, unwrap } from "./client";

export function getProducts(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<PaginatedData<Product>>(apiClient.get("/products", { params }));
}

export function createProduct(payload: Record<string, unknown>): Promise<{ id: number }> {
  return unwrap(apiClient.post("/products", payload));
}

export function updateProduct(id: number, payload: Record<string, unknown>): Promise<null> {
  return unwrap(apiClient.put(`/products/${id}`, payload));
}

export function deleteProduct(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/products/${id}`));
}

export function getProductPriceHistory(id: number): Promise<
  Array<{
    date: string;
    unitPrice: number;
    quantity: number;
    supplierName: string | null;
    invoiceNumber: string | null;
  }>
> {
  return unwrap(apiClient.get(`/products/${id}/price-history`));
}

export async function importProducts(file: File): Promise<{ created: number; skipped: number; total: number }> {
  const formData = new FormData();
  formData.append("file", file);
  return unwrap(apiClient.post("/products/import", formData));
}
