import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import ProductsPage from "../pages/ProductsPage";
import { useAuthStore } from "../store/authStore";

const getProductsMock = vi.fn();
const getCategoryFlatMock = vi.fn();
const getAllSuppliersMock = vi.fn();
const getProductPriceHistoryMock = vi.fn();

vi.mock("../api/products", () => ({
  getProducts: (...args: unknown[]) => getProductsMock(...args),
  getAllProducts: (...args: unknown[]) => getProductsMock(...args),
  getProductById: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getProductPriceHistory: (...args: unknown[]) => getProductPriceHistoryMock(...args),
  importProducts: vi.fn(),
  uploadProductImage: vi.fn(),
}));

vi.mock("../api/export", () => ({
  exportProducts: vi.fn(),
}));

vi.mock("../api/categories", () => ({
  getCategoryFlat: (...args: unknown[]) => getCategoryFlatMock(...args),
}));

vi.mock("../api/suppliers", () => ({
  getAllSuppliers: (...args: unknown[]) => getAllSuppliersMock(...args),
}));

describe("Products financial visibility", () => {
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

    getProductsMock.mockResolvedValue({
      items: [
        {
          id: 11,
          sku: "VEG-001",
          barcode: null,
          name_en: "NAPA",
          name_zh: "绍菜",
          category_id: 1,
          category_name: "蔬菜",
          supplier_name: "CBS",
          default_supplier_id: 3,
          default_unit: "Case",
          default_price: 50,
          image_url: null,
          notes: null,
          is_active: true,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
    });
    getCategoryFlatMock.mockResolvedValue([]);
    getAllSuppliersMock.mockResolvedValue([]);
    getProductPriceHistoryMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
    getProductsMock.mockReset();
    getCategoryFlatMock.mockReset();
    getAllSuppliersMock.mockReset();
    getProductPriceHistoryMock.mockReset();
  });

  it("hides default price and price-trend UI for staff", async () => {
    render(
      <MemoryRouter initialEntries={["/products"]}>
        <ProductsPage />
      </MemoryRouter>
    );

    await screen.findByText("绍菜");

    expect(screen.queryByText("进价")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "价格趋势" })).not.toBeInTheDocument();
  });

  it("loads six-month invoice price trend by default for admins", async () => {
    useAuthStore.setState({
      token: "admin-token",
      user: {
        id: 1,
        username: "admin",
        displayName: "管理员",
        role: "admin",
        email: "admin@pandamart.com",
      },
    });

    render(
      <MemoryRouter initialEntries={["/products"]}>
        <ProductsPage />
      </MemoryRouter>
    );

    await screen.findByText("绍菜");
    await userEvent.click(screen.getByRole("button", { name: "更多操作" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "价格趋势" }));

    await waitFor(() => {
      expect(getProductPriceHistoryMock).toHaveBeenCalledWith(11, {
        months: 6,
        groupBy: "invoice",
      });
    });
  });
});
