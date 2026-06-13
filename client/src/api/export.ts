import { apiClient } from "./client";

async function downloadFile(
  endpoint: string,
  fileName: string,
  params?: Record<string, string | number | boolean | undefined>
) {
  const response = await apiClient.get(endpoint, {
    params,
    responseType: "blob",
  });

  const url = window.URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function exportInvoices(params?: {
  dateFrom?: string;
  dateTo?: string;
  status?: "pending" | "confirmed" | "rejected";
}) {
  return downloadFile("/export/invoices", "invoices.xlsx", params);
}

export function exportInventory() {
  return downloadFile("/export/inventory", "inventory.xlsx");
}

export function exportSuppliers() {
  return downloadFile("/export/suppliers", "suppliers.xlsx");
}

export function exportPurchases(params: { dateFrom: string; dateTo: string; supplierId?: number }) {
  return downloadFile("/export/purchases", "purchases.xlsx", params);
}

export function exportReorderSuggestions() {
  return downloadFile("/export/reorder-suggestions", "reorder-suggestions.xlsx");
}

export function exportFullBackup() {
  return downloadFile("/export/full-backup", "pandamart-backup.json");
}
