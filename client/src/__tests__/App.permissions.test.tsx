import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { useAuthStore } from "../store/authStore";

vi.mock("../components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));

vi.mock("../pages/LoginPage", () => ({ default: () => <div>Login Page</div> }));
vi.mock("../pages/DashboardPage", () => ({ default: () => <div>Dashboard Page</div> }));
vi.mock("../pages/InvoiceScanPage", () => ({ default: () => <div>Invoice Scan Page</div> }));
vi.mock("../pages/InvoiceListPage", () => ({ default: () => <div>Invoice List Page</div> }));
vi.mock("../pages/InventoryPage", () => ({ default: () => <div>Inventory Page</div> }));
vi.mock("../pages/ProductsPage", () => ({ default: () => <div>Products Page</div> }));
vi.mock("../pages/SuppliersPage", () => ({ default: () => <div>Suppliers Page</div> }));
vi.mock("../pages/AiAssistantPage", () => ({ default: () => <div>AI Assistant Page</div> }));
vi.mock("../pages/NotificationsPage", () => ({ default: () => <div>Notifications Page</div> }));
vi.mock("../pages/StocktakePage", () => ({ default: () => <div>Stocktake Page</div> }));
vi.mock("../pages/AnalyticsPage", () => ({ default: () => <div>Analytics Page</div> }));
vi.mock("../pages/ExportPage", () => ({ default: () => <div>Export Page</div> }));
vi.mock("../pages/AuditLogsPage", () => ({ default: () => <div>Audit Logs Page</div> }));
vi.mock("../pages/SettingsPage", () => ({ default: () => <div>Settings Page</div> }));
vi.mock("../pages/UsersPage", () => ({ default: () => <div>Users Page</div> }));
vi.mock("../pages/NotFoundPage", () => ({ default: () => <div>Not Found Page</div> }));

describe("App permissions routing", () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: "staff-token",
      user: {
        id: 2,
        username: "staff1",
        displayName: "店员",
        role: "staff",
        email: "staff1@pandamart.com",
      },
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("redirects staff away from dashboard route", async () => {
    window.history.replaceState({}, "", "/");

    render(<App />);

    await screen.findByText("Invoice Scan Page");
    await waitFor(() => expect(window.location.pathname).toBe("/invoices/scan"));
    expect(screen.queryByText("Dashboard Page")).not.toBeInTheDocument();
  });

  it("redirects staff away from ai assistant route", async () => {
    window.history.replaceState({}, "", "/ai-assistant");

    render(<App />);

    await screen.findByText("Invoice Scan Page");
    await waitFor(() => expect(window.location.pathname).toBe("/invoices/scan"));
    expect(screen.queryByText("AI Assistant Page")).not.toBeInTheDocument();
  });

  it("renders a bare not-found page for unauthenticated unknown routes", async () => {
    useAuthStore.setState({ token: null, user: null });
    window.history.replaceState({}, "", "/unknown-route");

    render(<App />);

    await screen.findByText("Not Found Page");
    expect(screen.queryByTestId("main-layout")).not.toBeInTheDocument();
  });
});
