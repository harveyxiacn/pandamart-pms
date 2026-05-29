import type { AiProvider } from "../types";
import { apiClient, unwrap } from "./client";

export function getAiProviders(): Promise<AiProvider[]> {
  return unwrap(apiClient.get("/ai-providers"));
}

export function createAiProvider(payload: Record<string, unknown>): Promise<{ id: number }> {
  return unwrap(apiClient.post("/ai-providers", payload));
}

export function updateAiProvider(id: number, payload: Record<string, unknown>): Promise<null> {
  return unwrap(apiClient.put(`/ai-providers/${id}`, payload));
}

export function deleteAiProvider(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/ai-providers/${id}`));
}

export function setDefaultAiProvider(id: number): Promise<null> {
  return unwrap(apiClient.put(`/ai-providers/${id}/set-default`));
}

export function testAiProvider(id: number): Promise<{
  success: boolean;
  message: string;
  latencyMs: number;
  modelResponse: string | null;
}> {
  return unwrap(apiClient.post(`/ai-providers/${id}/test`));
}
