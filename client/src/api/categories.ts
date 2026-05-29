import type { Category } from "../types";
import { apiClient, unwrap } from "./client";

export function getCategoryTree(): Promise<Category[]> {
  return unwrap(apiClient.get("/categories"));
}

export function getCategoryFlat(): Promise<Category[]> {
  return unwrap(apiClient.get("/categories/flat"));
}

export function createCategory(payload: {
  name: string;
  nameEn?: string;
  parentId?: number | null;
  sortOrder?: number;
}): Promise<{ id: number }> {
  return unwrap(apiClient.post("/categories", payload));
}

export function updateCategory(id: number, payload: Record<string, unknown>): Promise<null> {
  return unwrap(apiClient.put(`/categories/${id}`, payload));
}

export function deleteCategory(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/categories/${id}`));
}
