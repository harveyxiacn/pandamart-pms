import type { NotificationItem, PaginatedData } from "../types";
import { apiClient, unwrap } from "./client";

export function getNotifications(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<PaginatedData<NotificationItem>>(apiClient.get("/notifications", { params }));
}

export function getUnreadCount(): Promise<{ count: number }> {
  return unwrap(apiClient.get("/notifications/unread-count"));
}

export function markNotificationRead(id: number): Promise<null> {
  return unwrap(apiClient.put(`/notifications/${id}/read`));
}

export function markAllNotificationsRead(): Promise<null> {
  return unwrap(apiClient.put("/notifications/read-all"));
}
