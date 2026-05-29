export const APP_NAME = "PandaMart PMS";
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  confirmed: "已确认",
  rejected: "已驳回",
};

export const STORAGE_KEYS = {
  token: "pm_token",
  user: "pm_user",
};
