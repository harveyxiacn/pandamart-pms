import type { InvoiceDetail, InvoiceSummary, PaginatedData } from "../types";
import { apiClient, unwrap } from "./client";
import type { AxiosProgressEvent } from "axios";

export function getInvoices(params?: Record<string, string | number | boolean | undefined>) {
  return unwrap<PaginatedData<InvoiceSummary>>(apiClient.get("/invoices", { params }));
}

export function getInvoiceById(id: number): Promise<InvoiceDetail> {
  return unwrap(apiClient.get(`/invoices/${id}`));
}

interface UploadInvoiceOptions {
  timeoutMs?: number;
  onUploadProgress?: (progressPercent: number) => void;
}

export interface OcrStatus {
  mode: "local" | "auto" | "llm";
  llmConfigured: boolean;
  local: {
    available: boolean;
    engine: "tesseract";
    binary: string;
    version: string | null;
    languages: string[];
    requestedLanguages: string;
    pdfRenderer: { available: boolean; binary: string };
    message: string;
    installHint: string;
  };
}

export function getOcrStatus(): Promise<OcrStatus> {
  return unwrap<OcrStatus>(apiClient.get("/invoices/ocr/status"));
}

export async function uploadInvoice(file: File, options?: UploadInvoiceOptions): Promise<{
  invoiceId: number;
  ocrMethod: string;
  ocrConfidence?: number;
  ocrWarnings?: string[];
  ocrEngine?: string;
  recognized: {
    supplierName: string | null;
    supplierCode: string | null;
    supplierAddress: string | null;
    supplierContact: string | null;
    invoiceNumber: string;
    invoiceDate: string;
    customerCode: string | null;
    items: Array<{
      productNameEn: string | null;
      productNameZh: string | null;
      productCode: string | null;
      productNumber: string | null;
      un: string | null;
      taxCode: "E" | "H" | null;
      quantity: number;
      unit: string;
      unitPrice: number;
      lineTotal: number;
      matchedProduct?: { id: number; nameEn: string; nameZh: string | null; confidence: number } | null;
    }>;
    salesTotal: number | null;
    taxTotal: number | null;
    total: number;
    subtotal: number | null;
    hasTax: boolean;
    taxAmount: number | null;
    grandTotal: number;
  };
  filePath: string;
  fileType: "pdf" | "image" | "excel";
}> {
  const formData = new FormData();
  formData.append("file", file);
  return unwrap(
    apiClient.post("/invoices/upload", formData, {
      timeout: options?.timeoutMs ?? 300000,
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!options?.onUploadProgress) return;
        if (!event.total || event.total <= 0) {
          options.onUploadProgress(0);
          return;
        }
        const progressPercent = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
        options.onUploadProgress(progressPercent);
      },
    })
  );
}

export function confirmInvoice(id: number, payload: Record<string, unknown>): Promise<{
  invoiceId: number;
  status: string;
  newProductsCreated: number;
  inventoryUpdated: number;
  priceAlerts: Array<{
    productId: number;
    productName: string;
    previousPrice: number;
    currentPrice: number;
    changePercent: number;
  }>;
}> {
  return unwrap(apiClient.post(`/invoices/${id}/confirm`, payload));
}

export function updateInvoice(id: number, payload: Record<string, unknown>): Promise<InvoiceDetail> {
  return unwrap(apiClient.put(`/invoices/${id}`, payload));
}

export function deleteInvoice(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/invoices/${id}`));
}

export function rollbackInvoiceConfirm(id: number, reason: string): Promise<InvoiceDetail> {
  return unwrap(apiClient.post(`/invoices/${id}/rollback-confirm`, { reason }));
}

export function rejectInvoice(id: number, reason: string): Promise<null> {
  return unwrap(apiClient.post(`/invoices/${id}/reject`, { reason }));
}

export function getInvoiceFileUrl(id: number): string {
  return `${apiClient.defaults.baseURL}/invoices/${id}/file`;
}
