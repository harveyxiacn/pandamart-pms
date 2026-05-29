import { apiClient, unwrap } from "./client";

export interface PayableRow {
  supplierId: number;
  supplierName: string;
  billed: number;
  paid: number;
  outstanding: number;
  invoiceCount: number;
  lastInvoiceDate: string | null;
}

export interface PayablesSummary {
  items: PayableRow[];
  totalOutstanding: number;
}

export interface SupplierPayableDetail {
  supplier: { id: number; name: string };
  billed: number;
  paid: number;
  outstanding: number;
  invoices: Array<{ id: number; invoiceNumber: string; invoiceDate: string; grandTotal: number }>;
  payments: Array<{
    id: number;
    amount: number;
    method: string | null;
    paidAt: string;
    note: string | null;
    invoiceId: number | null;
    createdBy: string | null;
  }>;
}

export function getPayables(): Promise<PayablesSummary> {
  return unwrap(apiClient.get("/payables"));
}

export function getSupplierPayable(supplierId: number): Promise<SupplierPayableDetail> {
  return unwrap(apiClient.get(`/payables/${supplierId}`));
}

export function recordPayment(payload: {
  supplierId: number;
  amount: number;
  invoiceId?: number | null;
  method?: string;
  paidAt?: string;
  note?: string;
}): Promise<{ id: number }> {
  return unwrap(apiClient.post("/payables/payments", payload));
}
