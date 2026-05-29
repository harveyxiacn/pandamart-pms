import { apiClient, unwrap } from "./client";

export function getSettings(): Promise<Record<string, string>> {
  return unwrap(apiClient.get("/settings"));
}

export function updateSettings(payload: Record<string, string>): Promise<null> {
  return unwrap(apiClient.put("/settings", payload));
}
