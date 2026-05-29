import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InventoryPage from "../pages/InventoryPage";
import { useAuthStore } from "../store/authStore";

const getInventoryMock = vi.fn();
const getInventoryLogsMock = vi.fn();

vi.mock("../api/inventory", () => ({
  getInventory: (...args: unknown[]) => getInventoryMock(...args),
  getInventoryLogs: (...args: unknown[]) => getInventoryLogsMock(...args),
  adjustInventory: vi.fn(),
  setSafeStock: vi.fn(),
}));

describe("Inventory permissions", () => {
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

    getInventoryMock.mockResolvedValue({
      items: [
        {
          id: 10,
          product: {
            id: 101,
            nameEn: "NAPA",
            nameZh: "绍菜",
            sku: "VEG-001",
            category: "蔬菜",
          },
          quantity: 8,
          unit: "Case",
          safeStock: 4,
          isLowStock: false,
          lastRestockDate: null,
          lastRestockQuantity: null,
        },
      ],
      pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
      summary: { totalProducts: 1, lowStockCount: 0, outOfStockCount: 0 },
    });
    getInventoryLogsMock.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
    getInventoryMock.mockReset();
    getInventoryLogsMock.mockReset();
  });

  it("does not show inventory adjustment action for staff users", async () => {
    render(<InventoryPage />);

    await screen.findByText("绍菜");
    expect(screen.queryByRole("button", { name: "调整" })).not.toBeInTheDocument();
  });
});
