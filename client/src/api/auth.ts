import type { AuthUser, LoginResult } from "../types";
import { apiClient, unwrap } from "./client";

export function login(username: string, password: string): Promise<LoginResult> {
  return unwrap(apiClient.post("/auth/login", { username, password }));
}

export function getMyProfile(): Promise<AuthUser> {
  return unwrap(apiClient.get("/auth/me"));
}

export function logout(): Promise<null> {
  return unwrap(apiClient.post("/auth/logout"));
}

export function changePassword(currentPassword: string, newPassword: string): Promise<null> {
  return unwrap(apiClient.put("/auth/password", { currentPassword, newPassword }));
}
