export type UserRole = "admin" | "staff";

export interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field?: string; message?: string }>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: ApiError;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationInfo;
}

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  email: string | null;
}

export interface LoginResult {
  token: string;
  expiresIn: number;
  user: AuthUser;
}

export interface DashboardData {
  today: {
    invoiceCount: number;
    totalAmount: number;
    pendingInvoices: number;
    lowStockAlerts: number;
  };
  thisWeek: {
    invoiceCount: number;
    totalAmount: number;
  };
  thisMonth: {
    invoiceCount: number;
    totalAmount: number;
  };
  recentInvoices: Array<{
    id: number;
    supplierName: string | null;
    invoiceNumber: string;
    grandTotal: number;
    status: "pending" | "confirmed" | "rejected";
    createdAt: string;
  }>;
  lowStockProducts: Array<{
    productId: number;
    nameEn: string;
    nameZh: string | null;
    quantity: number;
    safeStock: number;
    unit: string;
  }>;
  comparisons: {
    yesterday: { totalAmount: number };
    prevWeek: { totalAmount: number };
    prevMonth: { totalAmount: number };
  };
  expiringBatches: Array<{
    productId: number;
    nameEn: string;
    nameZh: string | null;
    batchNo: string;
    expiryDate: string;
    quantity: number;
    expired: boolean;
  }>;
}

export type AlertType = "stockout_risk" | "price_spike" | "pending_invoice" | "expiring_batch" | "slow_mover" | "cost_increase";
export type AlertSeverity = "high" | "medium" | "low";

export interface DashboardAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  link?: string;
  count?: number;
}

export interface GlobalSearchResult {
  products: Array<{
    id: number;
    nameEn: string;
    nameZh: string | null;
    sku: string | null;
    barcode: string | null;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    grandTotal: number;
    status: string;
    invoiceDate: string;
    supplierName: string | null;
  }>;
  suppliers: Array<{
    id: number;
    name: string;
    code: string | null;
    contactName: string | null;
    phone: string | null;
  }>;
}

export interface Category {
  id: number;
  name: string;
  name_en?: string | null;
  sort_order?: number;
  parent_id?: number | null;
  productCount?: number;
  children?: Category[];
}

export interface Supplier {
  id: number;
  name: string;
  code: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: number;
  sku: string | null;
  barcode: string | null;
  name_en: string;
  name_zh: string | null;
  category_id: number | null;
  category_name?: string | null;
  supplier_name?: string | null;
  default_supplier_id: number | null;
  default_unit: string;
  default_price: number | null;
  selling_price: number | null;
  is_perishable?: boolean;
  shelf_life_days?: number | null;
  image_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface InvoiceSummary {
  id: number;
  supplierName: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  grandTotal: number;
  itemCount: number;
  status: "pending" | "confirmed" | "rejected";
  ocrMethod: string;
  uploadedBy: string | null;
  confirmedBy: string | null;
  createdAt: string;
}

export interface InvoiceOcrItem {
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
}

export interface InvoiceOcrRawResult {
  supplierName: string | null;
  supplierCode: string | null;
  supplierAddress: string | null;
  supplierContact: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  customerCode: string | null;
  items: InvoiceOcrItem[];
  salesTotal: number | null;
  taxTotal: number | null;
  total: number;
  subtotal: number | null;
  hasTax: boolean;
  taxAmount: number | null;
  grandTotal: number;
}

export interface InvoiceDetail {
  id: number;
  supplier: { id: number; name: string } | null;
  invoiceNumber: string;
  invoiceDate: string;
  customerCode: string | null;
  items: Array<{
    id: number;
    product: { id: number; nameEn: string; nameZh: string | null } | null;
    rawNameEn: string | null;
    rawNameZh: string | null;
    rawProductCode: string | null;
    rawProductNumber: string | null;
    rawUn: string | null;
    rawTaxCode: "E" | "H" | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number | null;
  hasTax: boolean;
  taxAmount: number | null;
  grandTotal: number;
  filePath: string;
  fileType: string;
  ocrMethod: string;
  ocrRawResult: InvoiceOcrRawResult | Record<string, unknown> | string | null;
  status: "pending" | "confirmed" | "rejected";
  uploadedBy: { id: number; displayName: string };
  confirmedBy: { id: number; displayName: string } | null;
  confirmedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface InventoryItem {
  id: number;
  product: {
    id: number;
    nameEn: string;
    nameZh: string | null;
    sku: string | null;
    category: string | null;
  };
  quantity: number;
  unit: string;
  safeStock: number | null;
  isLowStock: boolean;
  lastRestockDate: string | null;
  lastRestockQuantity: number | null;
}

export interface InventorySummary {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  type: "stock_alert" | "price_alert" | "system" | "invoice";
  title: string;
  message: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

export interface AiProvider {
  id: number;
  name: string;
  baseUrl: string;
  apiKeyMasked: string;
  model: string;
  thinkingEffort: "xhigh" | "high" | "medium" | "low" | null;
  supportsVision: boolean;
  purpose: "ocr" | "analysis" | "chat" | "all";
  isActive: boolean;
  isDefault: boolean;
  maxTokens: number;
  temperature: number;
  lastTestAt: string | null;
  lastTestSuccess: boolean | null;
  lastTestLatencyMs: number | null;
  notes: string | null;
  createdAt: string;
}
