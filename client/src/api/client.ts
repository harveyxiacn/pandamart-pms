import axios from "axios";
import type { ApiResponse } from "../types";
import { API_BASE_URL, STORAGE_KEYS } from "../utils/constants";

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = error.response?.data?.error?.message;
    if (typeof apiMessage === "string" && apiMessage.trim()) {
      return apiMessage;
    }

    const responseMessage = error.response?.data?.message;
    if (typeof responseMessage === "string" && responseMessage.trim()) {
      return responseMessage;
    }

    if (error.code === "ECONNABORTED") {
      return "请求超时，请稍后重试";
    }

    if (!error.response) {
      return "无法连接到服务端，请确认系统服务已启动";
    }

    return error.message;
  }

  return error instanceof Error ? error.message : "请求失败";
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.token);
      localStorage.removeItem(STORAGE_KEYS.user);
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(new Error(extractErrorMessage(error)));
  }
);

export async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) {
    throw new Error(data.error?.message || "请求失败");
  }
  return data.data;
}
