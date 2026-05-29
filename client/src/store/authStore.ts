import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "../types";
import { STORAGE_KEYS } from "../utils/constants";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        localStorage.setItem(STORAGE_KEYS.token, token);
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
        set({ token, user });
      },
      clearAuth: () => {
        localStorage.removeItem(STORAGE_KEYS.token);
        localStorage.removeItem(STORAGE_KEYS.user);
        set({ token: null, user: null });
      },
    }),
    {
      name: "pandamart-auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);
