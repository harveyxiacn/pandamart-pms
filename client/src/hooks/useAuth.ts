import { useMemo } from "react";
import * as authApi from "../api/auth";
import { useAuthStore } from "../store/authStore";

export function useAuth() {
  const { token, user, setAuth, clearAuth } = useAuthStore();

  return useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      isAdmin: user?.role === "admin",
      async login(username: string, password: string) {
        const data = await authApi.login(username, password);
        setAuth(data.token, data.user);
        return data;
      },
      async logout() {
        try {
          await authApi.logout();
        } finally {
          clearAuth();
        }
      },
      clearAuth,
    }),
    [token, user, setAuth, clearAuth]
  );
}
