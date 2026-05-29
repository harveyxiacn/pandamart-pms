import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvoiceListPage from "../pages/InvoiceListPage";
import { useAuthStore } from "../store/authStore";

const getInvoicesMock = vi.fn();
const getInvoiceByIdMock = vi.fn();
const getSuppliersMock = vi.fn();

vi.mock("../api/invoices", () => ({
  getInvoices: (...args: unknown[]) => getInvoicesMock(...args),
  getInvoiceById: (...args: unknown[]) => getInvoiceByIdMock(...args),
  confirmInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  rollbackInvoiceConfirm: vi.fn(),
  updateInvoice: vi.fn(),
}));

vi.mock("../api/suppliers", () => ({
  getSuppliers: (...args: unknown[]) => getSuppliersMock(...args),
}));

describe("Invoice list staff scope", () => {
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

    getInvoicesMock.mockResolvedValue({
      items: [
        {
          id: 42,
          supplierName: "CBS",
          invoiceNumber: "INV-42",
          invoiceDate: "2026-03-01",
          grandTotal: 120,
          itemCount: 2,
          status: "pending",
          ocrMethod: "ai_vision",
          uploadedBy: "staff1",
          confirmedBy: null,
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    });

    getSuppliersMock.mockResolvedValue({
      items: [{ id: 3, name: "CBS" }],
      pagination: { page: 1, pageSize: 500, total: 1, totalPages: 1 },
    });

    getInvoiceByIdMock.mockResolvedValue({
      id: 42,
      supplier: { id: 3, name: "CBS" },
      invoiceNumber: "INV-42",
      invoiceDate: "2026-03-01",
      customerCode: null,
      items: [
        {
          id: 1,
          product: { id: 101, nameEn: "NAPA", nameZh: "绍菜" },
          rawNameEn: "NAPA",
          rawNameZh: "绍菜",
          rawProductCode: "P-001",
          rawProductNumber: "001",
          rawUn: "Case",
          rawTaxCode: "E",
          quantity: 2,
          unit: "Case",
          unitPrice: 60,
          lineTotal: 120,
        },
      ],
      subtotal: 120,
      hasTax: false,
      taxAmount: 0,
      grandTotal: 120,
      filePath: "/uploads/invoice.pdf",
      fileType: "pdf",
      ocrMethod: "ai_vision",
      ocrRawResult: null,
      status: "pending",
      uploadedBy: { id: 2, displayName: "店员" },
      confirmedBy: null,
      confirmedAt: null,
      notes: null,
      createdAt: "2026-03-01T00:00:00.000Z",
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
    getInvoicesMock.mockReset();
    getInvoiceByIdMock.mockReset();
    getSuppliersMock.mockReset();
  });

  it("forces pending-only query and hides historical status filter for staff", async () => {
    render(<InvoiceListPage />);

    await screen.findByText("INV-42");
    await waitFor(() =>
      expect(getInvoicesMock).toHaveBeenCalledWith({
        pageSize: 100,
        status: "pending",
        keyword: undefined,
      })
    );
    expect(screen.queryByLabelText("状态")).not.toBeInTheDocument();
  });

  it("keeps pending invoice confirm flow available for staff", async () => {
    const user = userEvent.setup();
    render(<InvoiceListPage />);

    await screen.findByText("INV-42");
    await user.click(screen.getAllByRole("button", { name: "查看" })[0]);

    await screen.findByText("发票详情");
    expect(screen.getByRole("button", { name: "确认入库" })).toBeInTheDocument();
  });
});
