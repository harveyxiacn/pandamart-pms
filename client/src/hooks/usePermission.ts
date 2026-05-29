import { useAuth } from "./useAuth";

export function usePermission() {
  const { user, isAdmin } = useAuth();

  return {
    role: user?.role ?? null,
    canViewDashboard: isAdmin,
    canUseAiAssistant: isAdmin,
    canManageUsers: isAdmin,
    canManageSettings: isAdmin,
    canEditCatalog: isAdmin,
    canAdjustInventory: isAdmin,
    canAdjustSafeStock: isAdmin,
    canUseAnalytics: Boolean(isAdmin),
  };
}
