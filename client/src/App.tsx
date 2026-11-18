import { t, useLanguage } from "./i18n";
import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { useAuth } from "./hooks/useAuth";
import { DEMO_MODE } from "./demo/constants";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InvoiceScanPage = lazy(() => import("./pages/InvoiceScanPage"));
const InvoiceListPage = lazy(() => import("./pages/InvoiceListPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const SalesPage = lazy(() => import("./pages/SalesPage"));
const StocktakePage = lazy(() => import("./pages/StocktakePage"));
const BatchesPage = lazy(() => import("./pages/BatchesPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage"));
const PayablesPage = lazy(() => import("./pages/PayablesPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const AiAssistantPage = lazy(() => import("./pages/AiAssistantPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function PageFallback() {
  useLanguage();
  return (
    <div className="rounded-xl border border-white/40 bg-white/70 p-4 text-sm text-slate-600">{t("页面加载中...")}</div>
  );
}

function ProtectedRoute() {
  useLanguage();
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ destination: location.pathname + location.search }} />;
  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  );
}

function AdminRoute() {
  useLanguage();
  const { isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ destination: location.pathname + location.search }} />;
  if (!isAdmin) return <Navigate to="/invoices/scan" replace />;
  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  );
}

function NotFoundRoute() {
  useLanguage();
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <NotFoundPage />;
  }

  return (
    <MainLayout>
      <NotFoundPage />
    </MainLayout>
  );
}

export default function App() {
  useLanguage();
  // GitHub Pages serves static files only; hash routing keeps deep links working
  // without a server-side rewrite. Local/dev builds keep clean browser URLs.
  const Router = DEMO_MODE ? HashRouter : BrowserRouter;

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router>
          <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/invoices/scan" element={<InvoiceScanPage />} />
            <Route path="/invoices" element={<InvoiceListPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/batches" element={<BatchesPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          <Route element={<AdminRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/ai-assistant" element={<AiAssistantPage />} />
            <Route path="/payables" element={<PayablesPage />} />
            <Route path="/stocktake" element={<StocktakePage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/exports" element={<ExportPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/users" element={<UsersPage />} />
          </Route>

              <Route path="*" element={<NotFoundRoute />} />
            </Routes>
          </Suspense>
        </Router>
      </ConfirmProvider>
    </ToastProvider>
  );
}
