import { apiClient, unwrap } from "./client";

export type AuditLogItem = {
  id: number;
  user: {
    id: number;
    username: string;
    displayName: string;
  } | null;
  action: string;
  entityType: string;
  entityId: number | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
};

export function getAuditLogs(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<{
    items: AuditLogItem[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }>(apiClient.get("/audit-logs", { params }));
}
