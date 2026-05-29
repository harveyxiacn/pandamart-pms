import { apiClient, unwrap } from "./client";

export function getUsers(): Promise<
  Array<{
    id: number;
    username: string;
    display_name: string;
    email: string | null;
    role: "admin" | "staff";
    is_active: boolean;
    created_at: string;
    last_login_at: string | null;
  }>
> {
  return unwrap(apiClient.get("/users"));
}

export function createUser(payload: {
  username: string;
  password: string;
  displayName: string;
  email?: string;
  role: "admin" | "staff";
}): Promise<{ id: number }> {
  return unwrap(apiClient.post("/users", payload));
}

export function updateUser(id: number, payload: Record<string, unknown>): Promise<null> {
  return unwrap(apiClient.put(`/users/${id}`, payload));
}

export function updateUserStatus(id: number, isActive: boolean): Promise<null> {
  return unwrap(apiClient.put(`/users/${id}/status`, { isActive }));
}

export function resetUserPassword(id: number, newPassword: string): Promise<null> {
  return unwrap(apiClient.put(`/users/${id}/reset-password`, { newPassword }));
}
