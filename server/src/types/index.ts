import { Request } from 'express';

// ==================== 用户相关 ====================
export interface JwtPayload {
  sub: number;
  username: string;
  role: 'admin' | 'staff';
  tv?: number; // token_version：与库中用户当前 token_version 比对，用于令牌失效
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  email: string | null;
  role: 'admin' | 'staff';
  is_active: boolean;
  last_login_at: Date | null;
  login_attempts: number;
  locked_until: Date | null;
  token_version: number;
  created_at: Date;
  updated_at: Date;
}

// ==================== 供应商相关 ====================
export interface SupplierRow {
  id: number;
  name: string;
  code: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// ==================== 分类相关 ====================
export interface CategoryRow {
  id: number;
  name: string;
  name_en: string | null;
  parent_id: number | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

// ==================== 产品相关 ====================
export interface ProductRow {
  id: number;
  sku: string | null;
  barcode: string | null;
  name_en: string;
  name_zh: string | null;
  category_id: number | null;
  default_supplier_id: number | null;
  default_unit: string;
  default_price: number | null;
  selling_price: number | null;
  is_perishable: boolean;
  shelf_life_days: number | null;
  image_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// ==================== 发票相关 ====================
export type InvoiceStatus = 'pending' | 'confirmed' | 'rejected';
export type FileType = 'pdf' | 'image' | 'excel';
export type OcrMethod = 'text_extract' | 'local_ocr' | 'ai_vision' | 'excel_parse' | 'manual';

export interface InvoiceRow {
  id: number;
  supplier_id: number | null;
  invoice_number: string;
  invoice_date: Date;
  customer_code: string | null;
  subtotal: number | null;
  has_tax: boolean;
  tax_amount: number | null;
  grand_total: number;
  file_path: string;
  file_type: FileType;
  ocr_method: OcrMethod;
  ocr_raw_result: any;
  status: InvoiceStatus;
  uploaded_by: number;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface InvoiceItemRow {
  id: number;
  invoice_id: number;
  product_id: number | null;
  raw_name_en: string | null;
  raw_name_zh: string | null;
  raw_product_code: string | null;
  raw_product_number: string | null;
  raw_un: string | null;
  raw_tax_code: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  matched_confidence: number | null;
  created_at: Date;
  updated_at: Date;
}

// ==================== 库存相关 ====================
export type InventoryLogType = 'in' | 'out' | 'adjust' | 'stocktake';

export interface InventoryRow {
  id: number;
  product_id: number;
  store_id: number; // 多店预留（迁移 016）：库存唯一键为 (product_id, store_id)
  quantity: number;
  unit: string;
  safe_stock: number | null;
  last_restock_date: Date | null;
  last_restock_quantity: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface InventoryLogRow {
  id: number;
  product_id: number;
  store_id: number;
  type: InventoryLogType;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  invoice_id: number | null;
  sales_order_id: number | null;
  reason: string | null;
  operated_by: number;
  created_at: Date;
}

// ==================== 门店相关（多店就绪，当前单店） ====================
export interface StoreRow {
  id: number;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ==================== 销售相关 ====================
export type SalesOrderStatus = 'completed' | 'voided';

export interface SalesOrderRow {
  id: number;
  store_id: number;
  order_no: string;
  total: number;
  status: SalesOrderStatus;
  note: string | null;
  sold_by: number;
  voided_by: number | null;
  voided_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SalesItemRow {
  id: number;
  sales_order_id: number;
  product_id: number;
  quantity: number;
  unit: string;
  unit_price: number;
  cost_price: number | null;
  line_total: number;
  created_at: Date;
}

export interface CreateSaleItem {
  productId: number;
  quantity: number;
  unitPrice: number;
}

export interface CreateSaleBody {
  items: CreateSaleItem[];
  note?: string | null;
}

// ==================== 批次 / 保质期相关 ====================
export type BatchStatus = 'active' | 'depleted' | 'disposed';

export interface InventoryBatchRow {
  id: number;
  product_id: number;
  store_id: number;
  batch_no: string | null;
  expiry_date: Date | null;
  received_date: Date | null;
  quantity: number;
  status: BatchStatus;
  invoice_id: number | null;
  note: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBatchBody {
  productId: number;
  quantity: number;
  expiryDate?: string | null;
  batchNo?: string | null;
  receivedDate?: string | null;
  note?: string | null;
  /** 关联来源发票（可选）：手动按发票收货时记录批次→发票溯源。 */
  invoiceId?: number | null;
}

/** 销售明细消耗批次台账（迁移 023）：记录某条销售明细扣了哪些批次各多少，供 FIFO 记账与作废回补。 */
export interface SalesItemBatchRow {
  id: number;
  sales_item_id: number;
  batch_id: number | null;
  quantity: number;
  created_at: Date;
}

// ==================== AI 提供商相关 ====================
export type AiPurpose = 'ocr' | 'analysis' | 'chat' | 'all';

export interface AiProviderRow {
  id: number;
  name: string;
  base_url: string;
  api_key_encrypted: string;
  model: string;
  thinking_effort: 'xhigh' | 'high' | 'medium' | 'low' | null;
  supports_vision: boolean;
  purpose: AiPurpose;
  is_active: boolean;
  is_default: boolean;
  max_tokens: number;
  temperature: number;
  last_test_at: Date | null;
  last_test_success: boolean | null;
  last_test_latency_ms: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AiProviderConfig {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingEffort?: string | null;
  supportsVision: boolean;
  purpose: AiPurpose;
  isActive: boolean;
  maxTokens: number;
  temperature: number;
}

// ==================== 审计日志相关 ====================
export interface AuditLogRow {
  id: number;
  user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

// ==================== 系统设置相关 ====================
export interface SettingRow {
  id: number;
  key: string;
  value: string;
  description: string | null;
  updated_by: number | null;
  created_at: Date;
  updated_at: Date;
}

// ==================== 通知相关 ====================
export type NotificationType = 'stock_alert' | 'price_alert' | 'system' | 'invoice';

export interface NotificationRow {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  link: string | null;
  created_at: Date;
}

// ==================== 供应商商品别名（学习型匹配）相关 ====================
export type ProductAliasType = 'barcode' | 'code' | 'name';

export interface SupplierProductAliasRow {
  id: number;
  supplier_id: number;
  alias_type: ProductAliasType;
  alias_key: string;
  product_id: number;
  hits: number;
  created_at: Date;
  updated_at: Date;
}

// ==================== OCR 识别结果 ====================
export interface OcrRecognizedItem {
  productNameEn: string | null;
  productNameZh: string | null;
  productCode: string | null;
  productNumber: string | null;
  un: string | null;
  taxCode: 'E' | 'H' | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  matchedProduct?: {
    id: number;
    nameEn: string;
    nameZh: string | null;
    confidence: number;
  } | null;
}

export interface OcrRecognizedResult {
  supplierName: string | null;
  supplierCode: string | null;
  supplierAddress: string | null;
  supplierContact: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  customerCode: string | null;
  items: OcrRecognizedItem[];
  salesTotal: number | null;
  taxTotal: number | null;
  total: number;
  subtotal: number | null;
  hasTax: boolean;
  taxAmount: number | null;
  grandTotal: number;
}

// ==================== API 响应 ====================
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any[];
  };
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T = any> {
  items: T[];
  pagination: PaginationInfo;
}

// ==================== 请求参数 ====================
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ConfirmInvoiceItem {
  productId: number | null;
  productNameEn: string;
  productNameZh: string | null;
  productCode?: string | null;
  productNumber?: string | null;
  un?: string | null;
  taxCode?: 'E' | 'H' | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  isNewProduct: boolean;
  categoryId?: number;
}

export interface ConfirmInvoiceBody {
  supplierId: number;
  invoiceNumber: string;
  invoiceDate: string;
  customerCode: string | null;
  items: ConfirmInvoiceItem[];
  subtotal: number | null;
  hasTax: boolean;
  taxAmount: number | null;
  grandTotal: number;
  notes: string;
}

export interface UpdateInvoiceItem {
  id?: number;
  productId: number | null;
  productNameEn: string;
  productNameZh: string | null;
  productCode?: string | null;
  productNumber?: string | null;
  un?: string | null;
  taxCode?: 'E' | 'H' | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface UpdateInvoiceBody {
  supplierId: number | null;
  invoiceNumber: string;
  invoiceDate: string;
  customerCode: string | null;
  items: UpdateInvoiceItem[];
  subtotal: number | null;
  hasTax: boolean;
  taxAmount: number | null;
  grandTotal: number;
  notes: string;
}
