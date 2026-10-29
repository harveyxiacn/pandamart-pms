import type {
  AxiosAdapter,
  AxiosProgressEvent,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { STORAGE_KEYS } from "../utils/constants";
import { loadDemoDb, localDateKey, saveDemoDb, type DemoDb } from "./seed";

/* ------------------------------------------------------------------ */
/* In-browser demo backend.                                           */
/*                                                                    */
/* GitHub Pages can only serve static files, so the Express API is    */
/* replaced by this Axios adapter. Every endpoint used by the client   */
/* is implemented against a deterministic dataset in localStorage.    */
/* ------------------------------------------------------------------ */

type Row = Record<string, any>;
type Query = Record<string, unknown>;

const db: DemoDb = loadDemoDb();

function persist(): void {
  saveDemoDb(db);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, size: number) => String(n).padStart(size, "0");
const nowIso = () => new Date().toISOString();

function nextId(key: string): number {
  db.sequences[key] = (db.sequences[key] || 0) + 1;
  return db.sequences[key];
}

function nextRowId(rows: Row[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

function sumBy(rows: Row[], pick: (row: Row) => number): number {
  return rows.reduce((sum, row) => sum + (Number(pick(row)) || 0), 0);
}

/* ── dates ─────────────────────────────────────────────────────── */

function dateKey(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

function keyShift(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

function todayKey(): string {
  return keyShift(0);
}

function startOfWeek(base = new Date()): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function monthStartKey(offsetMonths = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-01`;
}

function inRange(value: unknown, from: string, to: string): boolean {
  const key = dateKey(value);
  return key >= from && key <= to;
}

/* ── query params ──────────────────────────────────────────────── */

function qStr(q: Query, key: string): string {
  const value = q[key];
  return value === undefined || value === null ? "" : String(value);
}

function qNum(q: Query, key: string): number | null {
  const value = q[key];
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function qBool(q: Query, key: string): boolean | null {
  const value = q[key];
  if (value === undefined || value === null || value === "") return null;
  return value === true || value === "true" || value === 1 || value === "1";
}

function rangeFromQuery(q: Query, defaultDays: number): { from: string; to: string } {
  return {
    from: qStr(q, "dateFrom") || keyShift(-defaultDays),
    to: qStr(q, "dateTo") || todayKey(),
  };
}

/* ── auth context ──────────────────────────────────────────────── */

function readStoredUser(): Row | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    return raw ? (JSON.parse(raw) as Row) : null;
  } catch {
    return null;
  }
}

function currentUserId(): number {
  const stored = readStoredUser();
  const id = Number(stored?.id);
  return Number.isFinite(id) && id > 0 ? id : 1;
}

function userName(id: unknown): string | null {
  const user = db.users.find((u) => Number(u.id) === Number(id));
  return user?.display_name ?? null;
}

function authUser(user: Row) {
  return {
    id: Number(user.id),
    username: String(user.username),
    displayName: String(user.display_name || user.username),
    role: user.role === "admin" ? "admin" : "staff",
    email: user.email ?? null,
  };
}

/* ── responses ─────────────────────────────────────────────────── */

function ok<T>(data: T, config: InternalAxiosRequestConfig, status = 200): AxiosResponse {
  return {
    data: { success: true, data },
    status,
    statusText: "OK",
    headers: {},
    config,
  } as AxiosResponse;
}

/** Binary/download responses are raw bodies, not the JSON envelope. */
function raw<T>(data: T, config: InternalAxiosRequestConfig, status = 200): AxiosResponse {
  return {
    data,
    status,
    statusText: "OK",
    headers: {},
    config,
  } as AxiosResponse;
}

function fail(
  status: number,
  code: string,
  message: string,
  config: InternalAxiosRequestConfig
): never {
  const error = new Error(message) as Error & {
    isAxiosError?: boolean;
    config?: unknown;
    response?: unknown;
    code?: string;
  };
  error.isAxiosError = true;
  error.config = config;
  error.code = status === 401 ? "ERR_BAD_REQUEST" : "ERR_BAD_RESPONSE";
  error.response = {
    data: { success: false, error: { code, message } },
    status,
    statusText: "",
    headers: {},
    config,
  };
  throw error;
}

function paginate<T>(rows: T[], q: Query, defaultPageSize = 20) {
  const requestedPage = Math.max(1, qNum(q, "page") ?? 1);
  const pageSize = Math.min(100, Math.max(1, qNum(q, "pageSize") ?? defaultPageSize));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages },
  };
}

function asRow(payload: unknown): Row {
  if (!payload || typeof payload !== "object") return {};
  if (typeof FormData !== "undefined" && payload instanceof FormData) return {};
  return payload as Row;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/* ── domain views ──────────────────────────────────────────────── */

function supplierOf(id: unknown): Row | null {
  return db.suppliers.find((s) => Number(s.id) === Number(id)) ?? null;
}

function parseOcr(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function invoiceSummary(inv: Row) {
  return {
    id: Number(inv.id),
    supplierName: inv.supplier_name ?? null,
    invoiceNumber: String(inv.invoice_number),
    invoiceDate: dateKey(inv.invoice_date),
    grandTotal: Number(inv.grand_total),
    itemCount: db.invoiceItems.filter((item) => Number(item.invoice_id) === Number(inv.id)).length,
    status: inv.status,
    ocrMethod: inv.ocr_method ?? "demo_ocr",
    uploadedBy: userName(inv.uploaded_by),
    confirmedBy: userName(inv.confirmed_by),
    createdAt: inv.created_at,
  };
}

function invoiceDetail(inv: Row) {
  const items = db.invoiceItems
    .filter((item) => Number(item.invoice_id) === Number(inv.id))
    .map((item) => {
      const product = db.products.find((p) => Number(p.id) === Number(item.product_id));
      return {
        id: Number(item.id),
        product: product
          ? { id: Number(product.id), nameEn: product.name_en, nameZh: product.name_zh ?? null }
          : null,
        rawNameEn: item.raw_name_en ?? null,
        rawNameZh: item.raw_name_zh ?? null,
        rawProductCode: item.raw_product_code ?? null,
        rawProductNumber: item.raw_product_number ?? null,
        rawUn: item.raw_un ?? null,
        rawTaxCode: (item.raw_tax_code as "E" | "H" | null) ?? null,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.line_total),
      };
    });

  const supplier = supplierOf(inv.supplier_id);
  return {
    id: Number(inv.id),
    supplier: supplier ? { id: Number(supplier.id), name: supplier.name } : null,
    invoiceNumber: String(inv.invoice_number),
    invoiceDate: dateKey(inv.invoice_date),
    customerCode: inv.customer_code ?? null,
    items,
    subtotal: Number(inv.subtotal),
    hasTax: Boolean(inv.has_tax),
    taxAmount: Number(inv.tax_amount),
    grandTotal: Number(inv.grand_total),
    filePath: inv.file_path ?? "",
    fileType: inv.file_type ?? "pdf",
    ocrMethod: inv.ocr_method ?? "demo_ocr",
    ocrRawResult: parseOcr(inv.ocr_raw_result),
    status: inv.status,
    uploadedBy: {
      id: Number(inv.uploaded_by) || 1,
      displayName: userName(inv.uploaded_by) ?? "系统",
    },
    confirmedBy: inv.confirmed_by
      ? { id: Number(inv.confirmed_by), displayName: userName(inv.confirmed_by) ?? "系统" }
      : null,
    confirmedAt: inv.confirmed_at ?? null,
    notes: inv.notes ?? null,
    createdAt: inv.created_at,
  };
}

function inventoryView(inv: Row) {
  const product = db.products.find((p) => Number(p.id) === Number(inv.product_id));
  const category = db.categories.find((c) => Number(c.id) === Number(product?.category_id));
  return {
    id: Number(inv.id),
    product: {
      id: Number(product?.id ?? inv.product_id),
      nameEn: product?.name_en ?? "未命名商品",
      nameZh: product?.name_zh ?? null,
      sku: product?.sku ?? null,
      category: category?.name ?? product?.category_name ?? null,
    },
    quantity: Number(inv.quantity),
    unit: inv.unit ?? product?.default_unit ?? "Case",
    safeStock: inv.safe_stock === null || inv.safe_stock === undefined ? null : Number(inv.safe_stock),
    isLowStock:
      inv.safe_stock !== null &&
      inv.safe_stock !== undefined &&
      Number(inv.quantity) < Number(inv.safe_stock),
    lastRestockDate: inv.last_restock_date ?? null,
    lastRestockQuantity:
      inv.last_restock_quantity === null || inv.last_restock_quantity === undefined
        ? null
        : Number(inv.last_restock_quantity),
  };
}

function batchView(batch: Row) {
  const product = db.products.find((p) => Number(p.id) === Number(batch.product_id));
  return {
    id: Number(batch.id),
    productId: Number(batch.product_id),
    nameEn: product?.name_en ?? "未命名商品",
    nameZh: product?.name_zh ?? null,
    sku: product?.sku ?? null,
    batchNo: batch.batch_no ?? null,
    expiryDate: batch.expiry_date ?? null,
    receivedDate: batch.received_date ?? null,
    quantity: Number(batch.quantity),
    status: batch.status,
    note: batch.note ?? null,
    createdAt: batch.created_at,
  };
}

function saleSummary(order: Row) {
  return {
    id: Number(order.id),
    orderNo: String(order.order_no),
    total: Number(order.total),
    status: order.status,
    note: order.note ?? null,
    soldBy: userName(order.sold_by),
    voidedAt: order.voided_at ?? null,
    createdAt: order.created_at,
  };
}

function saleDetail(order: Row) {
  const items = db.salesItems
    .filter((item) => Number(item.sales_order_id) === Number(order.id))
    .map((item) => {
      const product = db.products.find((p) => Number(p.id) === Number(item.product_id));
      return {
        id: Number(item.id),
        productId: Number(item.product_id),
        nameEn: product?.name_en ?? `商品 #${item.product_id}`,
        nameZh: product?.name_zh ?? null,
        sku: product?.sku ?? null,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unit_price),
        costPrice:
          item.cost_price === null || item.cost_price === undefined
            ? null
            : Number(item.cost_price),
        lineTotal: Number(item.line_total),
      };
    });
  return { ...saleSummary(order), items };
}

/* ── inventory helpers ─────────────────────────────────────────── */

function inventoryOf(productId: number): Row {
  let row = db.inventory.find((inv) => Number(inv.product_id) === Number(productId));
  if (!row) {
    row = {
      id: nextRowId(db.inventory),
      product_id: productId,
      store_id: 1,
      quantity: 0,
      unit: db.products.find((p) => Number(p.id) === productId)?.default_unit ?? "Case",
      safe_stock: Number(db.settings.default_safe_stock || 5),
      last_restock_date: null,
      last_restock_quantity: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db.inventory.push(row);
  }
  return row;
}

function addInventoryLog(entry: {
  product_id: number;
  type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  invoice_id?: number | null;
  sales_order_id?: number | null;
  reason?: string | null;
  operated_by?: number;
  created_at?: string;
}) {
  db.inventoryLogs.push({
    id: nextId("log"),
    store_id: 1,
    invoice_id: entry.invoice_id ?? null,
    sales_order_id: entry.sales_order_id ?? null,
    reason: entry.reason ?? null,
    operated_by: entry.operated_by ?? currentUserId(),
    created_at: entry.created_at ?? nowIso(),
    ...entry,
  });
}

function addAudit(action: string, entityType: string, entityId: number | null, details?: unknown) {
  db.auditLogs.push({
    id: nextId("audit"),
    user_id: currentUserId(),
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: details === undefined ? null : JSON.stringify(details),
    ip_address: "127.0.0.1",
    created_at: nowIso(),
  });
}

function addNotification(entry: {
  type: "stock_alert" | "price_alert" | "system" | "invoice";
  title: string;
  message: string;
  link: string | null;
}) {
  db.notifications.push({
    id: nextId("notification"),
    user_id: currentUserId(),
    type: entry.type,
    title: entry.title,
    message: entry.message,
    is_read: false,
    link: entry.link,
    created_at: nowIso(),
  });
}

/* ── categories ────────────────────────────────────────────────── */

function categoryIdsFor(categoryId: number): Set<number> {
  const ids = new Set<number>([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of db.categories) {
      if (
        category.parent_id !== null &&
        ids.has(Number(category.parent_id)) &&
        !ids.has(Number(category.id))
      ) {
        ids.add(Number(category.id));
        changed = true;
      }
    }
  }
  return ids;
}

function productCountFor(categoryId: number): number {
  const ids = categoryIdsFor(categoryId);
  return db.products.filter(
    (p) => !p.deleted_at && p.category_id !== null && ids.has(Number(p.category_id))
  ).length;
}

function categoryTree() {
  const bySort = (a: Row, b: Row) =>
    Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id) - Number(b.id);
  return db.categories
    .filter((c) => c.parent_id === null)
    .sort(bySort)
    .map((parent) => ({
      ...parent,
      productCount: productCountFor(Number(parent.id)),
      children: db.categories
        .filter((c) => Number(c.parent_id) === Number(parent.id))
        .sort(bySort)
        .map((child) => ({ ...child, productCount: productCountFor(Number(child.id)) })),
    }));
}

/* ── low stock & payables ──────────────────────────────────────── */

function lowStockRows(): Row[] {
  return db.inventory
    .filter(
      (inv) =>
        inv.safe_stock !== null &&
        inv.safe_stock !== undefined &&
        Number(inv.quantity) < Number(inv.safe_stock)
    )
    .sort((a, b) => {
      const needA = Number(a.safe_stock) - Number(a.quantity);
      const needB = Number(b.safe_stock) - Number(b.quantity);
      return needB - needA;
    });
}

function payablesSummary() {
  const rows = db.suppliers
    .map((supplier) => {
      const invoices = db.invoices.filter(
        (inv) => inv.status === "confirmed" && Number(inv.supplier_id) === Number(supplier.id)
      );
      const billed = round2(sumBy(invoices, (inv) => Number(inv.grand_total)));
      const paid = round2(
        sumBy(
          db.payments.filter((p) => Number(p.supplier_id) === Number(supplier.id)),
          (p) => Number(p.amount)
        )
      );
      const lastInvoiceDate = invoices
        .map((inv) => dateKey(inv.invoice_date))
        .sort((a, b) => b.localeCompare(a))[0] ?? null;
      return {
        supplierId: Number(supplier.id),
        supplierName: supplier.name,
        billed,
        paid,
        outstanding: round2(Math.max(0, billed - paid)),
        invoiceCount: invoices.length,
        lastInvoiceDate,
      };
    })
    .filter((row) => row.billed > 0 || row.paid > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  return {
    items: rows,
    totalOutstanding: round2(sumBy(rows, (row) => row.outstanding)),
  };
}

function payableDetail(supplierId: number) {
  const supplier = supplierOf(supplierId);
  if (!supplier) return null;
  const invoices = db.invoices.filter(
    (inv) => inv.status === "confirmed" && Number(inv.supplier_id) === supplierId
  );
  const payments = db.payments.filter((p) => Number(p.supplier_id) === supplierId);
  const billed = round2(sumBy(invoices, (inv) => Number(inv.grand_total)));
  const paid = round2(sumBy(payments, (p) => Number(p.amount)));
  return {
    supplier: { id: Number(supplier.id), name: supplier.name },
    billed,
    paid,
    outstanding: round2(Math.max(0, billed - paid)),
    invoices: invoices
      .sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)))
      .map((inv) => ({
        id: Number(inv.id),
        invoiceNumber: inv.invoice_number,
        invoiceDate: dateKey(inv.invoice_date),
        grandTotal: Number(inv.grand_total),
      })),
    payments: payments
      .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))
      .map((p) => ({
        id: Number(p.id),
        amount: Number(p.amount),
        method: p.method ?? null,
        paidAt: dateKey(p.paid_at),
        note: p.note ?? null,
        invoiceId: p.invoice_id ?? null,
        createdBy: userName(p.created_by),
      })),
  };
}

/* ── analytics ─────────────────────────────────────────────────── */

function trendRange(q: Query, period: string): { from: string; to: string } {
  const from = qStr(q, "dateFrom");
  const to = qStr(q, "dateTo");
  if (from || to) return { from: from || keyShift(-365), to: to || todayKey() };
  if (period === "month") {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 11);
    return { from: localDateKey(d), to: todayKey() };
  }
  if (period === "week") {
    const d = startOfWeek();
    d.setDate(d.getDate() - 11 * 7);
    return { from: localDateKey(d), to: todayKey() };
  }
  return { from: keyShift(-13), to: todayKey() };
}

function trendBuckets(
  period: string,
  from: string,
  to: string
): Array<{ key: string; start: string; end: string }> {
  const buckets: Array<{ key: string; start: string; end: string }> = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return buckets;

  if (period === "month") {
    let year = start.getFullYear();
    let month = start.getMonth();
    while (buckets.length < 400) {
      const bucketStart = new Date(year, month, 1);
      if (bucketStart > end) break;
      const bucketEnd = new Date(year, month + 1, 0);
      buckets.push({
        key: `${year}-${pad(month + 1, 2)}`,
        start: localDateKey(bucketStart),
        end: localDateKey(bucketEnd),
      });
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return buckets;
  }

  if (period === "week") {
    const cursor = startOfWeek(start);
    while (cursor <= end && buckets.length < 400) {
      const bucketEnd = new Date(cursor);
      bucketEnd.setDate(bucketEnd.getDate() + 6);
      buckets.push({
        key: localDateKey(cursor),
        start: localDateKey(cursor),
        end: localDateKey(bucketEnd),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return buckets;
  }

  const cursor = new Date(start);
  while (cursor <= end && buckets.length < 400) {
    const key = localDateKey(cursor);
    buckets.push({ key, start: key, end: key });
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

function purchaseTrend(q: Query) {
  const period = qStr(q, "period") || "week";
  const { from, to } = trendRange(q, period);
  const invoices = db.invoices.filter(
    (inv) => inv.status === "confirmed" && inRange(inv.invoice_date, from, to)
  );
  return trendBuckets(period, from, to).map((bucket) => {
    const rows = invoices.filter((inv) => inRange(inv.invoice_date, bucket.start, bucket.end));
    return {
      date: bucket.key,
      amount: round2(sumBy(rows, (inv) => Number(inv.grand_total))),
      invoiceCount: rows.length,
    };
  });
}

function salesTrend(q: Query) {
  const period = qStr(q, "period") || "week";
  const { from, to } = trendRange(q, period);
  const orders = db.salesOrders.filter(
    (order) => order.status === "completed" && inRange(order.created_at, from, to)
  );
  return trendBuckets(period, from, to).map((bucket) => {
    const rows = orders.filter((order) => inRange(order.created_at, bucket.start, bucket.end));
    return {
      date: bucket.key,
      amount: round2(sumBy(rows, (order) => Number(order.total))),
      orderCount: rows.length,
    };
  });
}

function priceChangeRows(q: Query): Row[] {
  const threshold = qNum(q, "threshold") ?? 5;
  const { from, to } = rangeFromQuery(q, 90);
  const byProduct = new Map<number, Row[]>();

  for (const invoice of db.invoices) {
    if (invoice.status !== "confirmed" || !inRange(invoice.invoice_date, from, to)) continue;
    for (const item of db.invoiceItems) {
      if (Number(item.invoice_id) !== Number(invoice.id) || !item.product_id) continue;
      const productId = Number(item.product_id);
      const list = byProduct.get(productId) ?? [];
      list.push({
        date: dateKey(invoice.invoice_date),
        unitPrice: Number(item.unit_price),
        createdAt: invoice.created_at,
        supplierName: invoice.supplier_name ?? null,
        invoiceNumber: invoice.invoice_number,
      });
      byProduct.set(productId, list);
    }
  }

  const rows: Row[] = [];
  byProduct.forEach((entries, productId) => {
    entries.sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.createdAt).localeCompare(String(b.createdAt))
    );
    const current = entries[entries.length - 1];
    const previous = entries[entries.length - 2];
    if (!current || !previous || previous.unitPrice <= 0) return;
    const changePercent = round2(
      ((current.unitPrice - previous.unitPrice) / previous.unitPrice) * 100
    );
    if (Math.abs(changePercent) < threshold) return;
    const product = db.products.find((p) => Number(p.id) === productId);
    rows.push({
      productId,
      nameEn: product?.name_en ?? `商品 #${productId}`,
      nameZh: product?.name_zh ?? null,
      previousPrice: previous.unitPrice,
      currentPrice: current.unitPrice,
      changePercent,
      supplierName: current.supplierName,
      invoiceNumber: current.invoiceNumber,
      date: current.date,
    });
  });

  rows.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  const limit = qNum(q, "limit");
  return limit ? rows.slice(0, limit) : rows;
}

function supplierDistribution(q: Query) {
  const { from, to } = rangeFromQuery(q, 90);
  const invoices = db.invoices.filter(
    (inv) => inv.status === "confirmed" && inRange(inv.invoice_date, from, to)
  );
  const total = sumBy(invoices, (inv) => Number(inv.grand_total));
  const groups = new Map<string, { totalAmount: number; invoiceCount: number }>();
  for (const invoice of invoices) {
    const name = invoice.supplier_name ?? "未匹配供应商";
    const group = groups.get(name) ?? { totalAmount: 0, invoiceCount: 0 };
    group.totalAmount += Number(invoice.grand_total);
    group.invoiceCount += 1;
    groups.set(name, group);
  }
  return Array.from(groups.entries())
    .map(([supplierName, group]) => ({
      supplierName,
      totalAmount: round2(group.totalAmount),
      percentage: total > 0 ? round2((group.totalAmount / total) * 100) : 0,
      invoiceCount: group.invoiceCount,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

function categoryDistribution(q: Query) {
  const { from, to } = rangeFromQuery(q, 90);
  const invoices = new Set(
    db.invoices
      .filter((inv) => inv.status === "confirmed" && inRange(inv.invoice_date, from, to))
      .map((inv) => Number(inv.id))
  );
  const groups = new Map<string, { totalAmount: number; products: Set<number> }>();
  let total = 0;

  for (const item of db.invoiceItems) {
    if (!invoices.has(Number(item.invoice_id))) continue;
    const product = db.products.find((p) => Number(p.id) === Number(item.product_id));
    const categoryName = product?.category_name ?? "其他";
    const group = groups.get(categoryName) ?? { totalAmount: 0, products: new Set<number>() };
    group.totalAmount += Number(item.line_total);
    if (item.product_id) group.products.add(Number(item.product_id));
    total += Number(item.line_total);
    groups.set(categoryName, group);
  }

  return Array.from(groups.entries())
    .map(([categoryName, group]) => ({
      categoryName,
      totalAmount: round2(group.totalAmount),
      percentage: total > 0 ? round2((group.totalAmount / total) * 100) : 0,
      productCount: group.products.size,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

function rankingRows(q: Query) {
  const { from, to } = rangeFromQuery(q, 30);
  const orderIds = new Set(
    db.salesOrders
      .filter((order) => order.status === "completed" && inRange(order.created_at, from, to))
      .map((order) => Number(order.id))
  );
  const groups = new Map<number, { totalAmount: number; quantity: number }>();
  for (const item of db.salesItems) {
    if (!orderIds.has(Number(item.sales_order_id))) continue;
    const productId = Number(item.product_id);
    const group = groups.get(productId) ?? { totalAmount: 0, quantity: 0 };
    group.totalAmount += Number(item.line_total);
    group.quantity += Number(item.quantity);
    groups.set(productId, group);
  }
  const rows = Array.from(groups.entries()).map(([productId, group]) => {
    const product = db.products.find((p) => Number(p.id) === productId);
    return {
      productId,
      nameEn: product?.name_en ?? `商品 #${productId}`,
      nameZh: product?.name_zh ?? null,
      totalAmount: round2(group.totalAmount),
      quantity: group.quantity,
    };
  });
  rows.sort((a, b) => b.totalAmount - a.totalAmount);
  const limit = qNum(q, "limit");
  return limit ? rows.slice(0, limit) : rows;
}

function reorderRows() {
  return lowStockRows()
    .map((inventory) => {
      const product = db.products.find((p) => Number(p.id) === Number(inventory.product_id));
      const currentStock = Number(inventory.quantity);
      const safeStock = Number(inventory.safe_stock);
      const suggestedQty = Math.max(1, Math.ceil(safeStock * 2 - currentStock));
      return {
        productId: Number(inventory.product_id),
        nameEn: product?.name_en ?? `商品 #${inventory.product_id}`,
        nameZh: product?.name_zh ?? null,
        sku: product?.sku ?? null,
        currentStock,
        safeStock,
        unit: inventory.unit ?? product?.default_unit ?? "Case",
        suggestedQty,
        urgency:
          currentStock <= 0 || currentStock < safeStock / 2 ? "high" : "medium",
      };
    })
    .sort((a, b) => (a.urgency === b.urgency ? b.safeStock - b.currentStock - (a.safeStock - a.currentStock) : a.urgency === "high" ? -1 : 1));
}

function profitData(q: Query) {
  const { from, to } = rangeFromQuery(q, 30);
  const orders = db.salesOrders.filter(
    (order) => order.status === "completed" && inRange(order.created_at, from, to)
  );
  const orderIds = new Set(orders.map((order) => Number(order.id)));
  const items = db.salesItems.filter((item) => orderIds.has(Number(item.sales_order_id)));

  const revenue = round2(sumBy(items, (item) => Number(item.line_total)));
  const cost = round2(
    sumBy(items, (item) => Number(item.cost_price ?? 0) * Number(item.quantity))
  );
  const grossProfit = round2(revenue - cost);

  const groups = new Map<number, { revenue: number; profit: number; qty: number }>();
  for (const item of items) {
    const productId = Number(item.product_id);
    const group = groups.get(productId) ?? { revenue: 0, profit: 0, qty: 0 };
    const lineRevenue = Number(item.line_total);
    const lineCost = Number(item.cost_price ?? 0) * Number(item.quantity);
    group.revenue += lineRevenue;
    group.profit += lineRevenue - lineCost;
    group.qty += Number(item.quantity);
    groups.set(productId, group);
  }

  const topProducts = Array.from(groups.entries())
    .map(([productId, group]) => {
      const product = db.products.find((p) => Number(p.id) === productId);
      return {
        nameEn: product?.name_en ?? `商品 #${productId}`,
        nameZh: product?.name_zh ?? null,
        revenue: round2(group.revenue),
        profit: round2(group.profit),
        qty: group.qty,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    revenue,
    cost,
    grossProfit,
    margin: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
    orderCount: orders.length,
    topProducts,
  };
}

function slowMoverData(q: Query) {
  const days = qNum(q, "days") ?? 30;
  const since = keyShift(-days);
  const soldByProduct = new Map<number, number>();
  const orderIds = new Set(
    db.salesOrders
      .filter((order) => order.status === "completed" && dateKey(order.created_at) >= since)
      .map((order) => Number(order.id))
  );
  for (const item of db.salesItems) {
    if (!orderIds.has(Number(item.sales_order_id))) continue;
    const productId = Number(item.product_id);
    soldByProduct.set(productId, (soldByProduct.get(productId) ?? 0) + Number(item.quantity));
  }

  const items = db.inventory
    .map((inventory) => {
      const product = db.products.find((p) => Number(p.id) === Number(inventory.product_id));
      return {
        productId: Number(inventory.product_id),
        nameEn: product?.name_en ?? `商品 #${inventory.product_id}`,
        nameZh: product?.name_zh ?? null,
        currentStock: Number(inventory.quantity),
        soldQty: soldByProduct.get(Number(inventory.product_id)) ?? 0,
      };
    })
    .filter((item) => item.currentStock > 0)
    .sort((a, b) => a.soldQty - b.soldQty || b.currentStock - a.currentStock);

  const limit = qNum(q, "limit") ?? 20;
  return { days, items: items.slice(0, limit) };
}

function profitByCategoryData(q: Query) {
  const { from, to } = rangeFromQuery(q, 30);
  const orderIds = new Set(
    db.salesOrders
      .filter((order) => order.status === "completed" && inRange(order.created_at, from, to))
      .map((order) => Number(order.id))
  );
  const groups = new Map<string, { revenue: number; cost: number }>();
  for (const item of db.salesItems) {
    if (!orderIds.has(Number(item.sales_order_id))) continue;
    const product = db.products.find((p) => Number(p.id) === Number(item.product_id));
    const category = product?.category_name ?? "其他";
    const group = groups.get(category) ?? { revenue: 0, cost: 0 };
    group.revenue += Number(item.line_total);
    group.cost += Number(item.cost_price ?? 0) * Number(item.quantity);
    groups.set(category, group);
  }
  return Array.from(groups.entries())
    .map(([category, group]) => ({
      category,
      revenue: round2(group.revenue),
      cost: round2(group.cost),
      profit: round2(group.revenue - group.cost),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function expiringBatchRows(days = 7): Array<Row & { expired: boolean }> {
  const today = todayKey();
  const until = keyShift(days);
  return db.batches
    .filter(
      (batch) =>
        batch.status === "active" &&
        Number(batch.quantity) > 0 &&
        batch.expiry_date &&
        dateKey(batch.expiry_date) <= until
    )
    .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)))
    .map((batch) => {
      const product = db.products.find((p) => Number(p.id) === Number(batch.product_id));
      return {
        productId: Number(batch.product_id),
        nameEn: product?.name_en ?? `商品 #${batch.product_id}`,
        nameZh: product?.name_zh ?? null,
        batchNo: batch.batch_no ?? `BN-${batch.id}`,
        expiryDate: dateKey(batch.expiry_date),
        quantity: Number(batch.quantity),
        expired: dateKey(batch.expiry_date) < today,
      };
    });
}

function dashboardData() {
  const today = todayKey();
  const weekStart = localDateKey(startOfWeek());
  const monthStart = monthStartKey();
  const confirmed = db.invoices.filter((inv) => inv.status === "confirmed");
  const stats = (rows: Row[]) => ({
    invoiceCount: rows.length,
    totalAmount: round2(sumBy(rows, (inv) => Number(inv.grand_total))),
  });

  const todayRows = confirmed.filter((inv) => dateKey(inv.invoice_date) === today);
  const weekRows = confirmed.filter((inv) => dateKey(inv.invoice_date) >= weekStart);
  const monthRows = confirmed.filter((inv) => dateKey(inv.invoice_date) >= monthStart);
  const lowRows = lowStockRows();

  const yesterday = keyShift(-1);
  const prevWeekStart = localDateKey(startOfWeek(new Date(Date.now() - 7 * 86400000)));
  const prevMonthStart = monthStartKey(-1);

  return {
    today: {
      ...stats(todayRows),
      pendingInvoices: db.invoices.filter((inv) => inv.status === "pending").length,
      lowStockAlerts: lowRows.length,
    },
    thisWeek: stats(weekRows),
    thisMonth: stats(monthRows),
    recentInvoices: [...db.invoices]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 5)
      .map((inv) => ({
        id: Number(inv.id),
        supplierName: inv.supplier_name ?? null,
        invoiceNumber: inv.invoice_number,
        grandTotal: Number(inv.grand_total),
        status: inv.status,
        createdAt: inv.created_at,
      })),
    lowStockProducts: lowRows.slice(0, 10).map((inventory) => {
      const product = db.products.find((p) => Number(p.id) === Number(inventory.product_id));
      return {
        productId: Number(inventory.product_id),
        nameEn: product?.name_en ?? `商品 #${inventory.product_id}`,
        nameZh: product?.name_zh ?? null,
        quantity: Number(inventory.quantity),
        safeStock: Number(inventory.safe_stock),
        unit: inventory.unit ?? product?.default_unit ?? "Case",
      };
    }),
    comparisons: {
      yesterday: {
        totalAmount: round2(
          sumBy(
            confirmed.filter((inv) => dateKey(inv.invoice_date) === yesterday),
            (inv) => Number(inv.grand_total)
          )
        ),
      },
      prevWeek: {
        totalAmount: round2(
          sumBy(
            confirmed.filter(
              (inv) =>
                dateKey(inv.invoice_date) >= prevWeekStart &&
                dateKey(inv.invoice_date) < weekStart
            ),
            (inv) => Number(inv.grand_total)
          )
        ),
      },
      prevMonth: {
        totalAmount: round2(
          sumBy(
            confirmed.filter(
              (inv) =>
                dateKey(inv.invoice_date) >= prevMonthStart &&
                dateKey(inv.invoice_date) < monthStart
            ),
            (inv) => Number(inv.grand_total)
          )
        ),
      },
    },
    expiringBatches: expiringBatchRows(7).slice(0, 5),
  };
}

function alertsData() {
  const alerts: Row[] = [];
  const pending = db.invoices.filter((inv) => inv.status === "pending").length;
  if (pending > 0) {
    alerts.push({
      id: "pending-invoices",
      type: "pending_invoice",
      severity: "high",
      title: `${pending} 张发票待审核`,
      message: "待审核发票尚未入库，确认后才会更新库存与应付账款。",
      link: "/invoices?status=pending",
      count: pending,
    });
  }

  const outOfStock = db.inventory.filter((inv) => Number(inv.quantity) <= 0);
  if (outOfStock.length > 0) {
    alerts.push({
      id: "stockout",
      type: "stockout_risk",
      severity: "high",
      title: `${outOfStock.length} 个商品已缺货`,
      message: "当前库存为 0，建议立即补货，避免影响门店销售。",
      link: "/inventory",
      count: outOfStock.length,
    });
  }

  const low = lowStockRows().filter((inv) => Number(inv.quantity) > 0);
  if (low.length > 0) {
    alerts.push({
      id: "low-stock",
      type: "stockout_risk",
      severity: "medium",
      title: `${low.length} 个商品低于安全库存`,
      message: "库存已接近安全线，可参考补货建议提前下单。",
      link: "/inventory",
      count: low.length,
    });
  }

  const expiring = expiringBatchRows(7);
  const expired = expiring.filter((batch) => batch.expired).length;
  if (expiring.length > 0) {
    alerts.push({
      id: "expiring-batches",
      type: "expiring_batch",
      severity: expired > 0 ? "high" : "medium",
      title: expired > 0 ? `${expired} 个批次已过期` : `${expiring.length} 个批次临期`,
      message: `未来 7 天内有 ${expiring.length} 个批次到期，请优先售出或及时报损。`,
      link: "/batches",
      count: expiring.length,
    });
  }

  const priceRows = priceChangeRows({ threshold: 5, dateFrom: keyShift(-30), dateTo: todayKey(), limit: 3 });
  if (priceRows.length > 0) {
    alerts.push({
      id: "price-spike",
      type: "price_spike",
      severity: "medium",
      title: "采购价出现明显波动",
      message: `${priceRows[0].nameEn} 最近一次进价变动 ${priceRows[0].changePercent > 0 ? "+" : ""}${priceRows[0].changePercent}%。`,
      link: "/analytics",
      count: priceRows.length,
    });
  }

  const slow = slowMoverData({ days: 30, limit: 100 }).items;
  if (slow.length > 0) {
    alerts.push({
      id: "slow-movers",
      type: "slow_mover",
      severity: "low",
      title: `${slow.length} 个商品存在滞销风险`,
      message: "这些商品库存充足但近 30 天销量很低，可考虑促销。",
      link: "/analytics",
      count: slow.length,
    });
  }

  return alerts;
}

function searchData(term: string) {
  const keyword = term.trim().toLowerCase();
  if (!keyword) return { products: [], invoices: [], suppliers: [] };
  const hit = (value: unknown) => String(value ?? "").toLowerCase().includes(keyword);

  return {
    products: db.products
      .filter(
        (p) =>
          !p.deleted_at &&
          (hit(p.name_en) || hit(p.name_zh) || hit(p.sku) || hit(p.barcode))
      )
      .slice(0, 5)
      .map((p) => ({
        id: Number(p.id),
        nameEn: p.name_en,
        nameZh: p.name_zh ?? null,
        sku: p.sku ?? null,
        barcode: p.barcode ?? null,
      })),
    invoices: db.invoices
      .filter((inv) => hit(inv.invoice_number) || hit(inv.supplier_name))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 5)
      .map((inv) => ({
        id: Number(inv.id),
        invoiceNumber: inv.invoice_number,
        grandTotal: Number(inv.grand_total),
        status: inv.status,
        invoiceDate: dateKey(inv.invoice_date),
        supplierName: inv.supplier_name ?? null,
      })),
    suppliers: db.suppliers
      .filter((s) => hit(s.name) || hit(s.code) || hit(s.contact_name) || hit(s.phone))
      .slice(0, 5)
      .map((s) => ({
        id: Number(s.id),
        name: s.name,
        code: s.code ?? null,
        contactName: s.contact_name ?? null,
        phone: s.phone ?? null,
      })),
  };
}

/* ── mutation helpers ──────────────────────────────────────────── */

class DemoError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${dateKey(key)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

function createProductRecord(payload: Row): Row {
  const id = nextRowId(db.products);
  const supplier = supplierOf(payload.defaultSupplierId);
  const category = db.categories.find(
    (c) => Number(c.id) === Number(payload.categoryId)
  );
  const product = {
    id,
    sku: payload.sku ? String(payload.sku) : `SKU-${pad(id, 4)}`,
    barcode: payload.barcode ? String(payload.barcode) : null,
    name_en: String(payload.nameEn || "未命名商品"),
    name_zh: payload.nameZh ? String(payload.nameZh) : null,
    category_id: category ? Number(category.id) : null,
    category_name: category?.name ?? null,
    default_supplier_id: supplier ? Number(supplier.id) : null,
    supplier_name: supplier?.name ?? null,
    default_unit: String(payload.defaultUnit || "Case"),
    default_price:
      payload.defaultPrice === null || payload.defaultPrice === undefined
        ? null
        : Number(payload.defaultPrice),
    selling_price:
      payload.sellingPrice === null || payload.sellingPrice === undefined
        ? null
        : Number(payload.sellingPrice),
    is_perishable: Boolean(payload.isPerishable),
    shelf_life_days:
      payload.shelfLifeDays === null || payload.shelfLifeDays === undefined
        ? null
        : Number(payload.shelfLifeDays),
    image_url: null,
    notes: payload.notes ? String(payload.notes) : null,
    is_active: payload.isActive !== false,
    deleted_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.products.push(product);
  db.inventory.push({
    id: nextRowId(db.inventory),
    product_id: id,
    store_id: 1,
    quantity: 0,
    unit: product.default_unit,
    safe_stock: Number(db.settings.default_safe_stock || 5),
    last_restock_date: null,
    last_restock_quantity: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return product;
}

function applyProductPayload(product: Row, payload: Row): void {
  const supplier = supplierOf(payload.defaultSupplierId);
  const category = db.categories.find(
    (c) => Number(c.id) === Number(payload.categoryId)
  );
  if ("sku" in payload) product.sku = payload.sku ? String(payload.sku) : null;
  if ("barcode" in payload) product.barcode = payload.barcode ? String(payload.barcode) : null;
  if ("nameEn" in payload) product.name_en = String(payload.nameEn);
  if ("nameZh" in payload) product.name_zh = payload.nameZh ? String(payload.nameZh) : null;
  if ("categoryId" in payload) {
    product.category_id = category ? Number(category.id) : null;
    product.category_name = category?.name ?? null;
  }
  if ("defaultSupplierId" in payload) {
    product.default_supplier_id = supplier ? Number(supplier.id) : null;
    product.supplier_name = supplier?.name ?? null;
  }
  if ("defaultUnit" in payload) product.default_unit = String(payload.defaultUnit);
  if ("defaultPrice" in payload) {
    product.default_price =
      payload.defaultPrice === null ? null : Number(payload.defaultPrice);
  }
  if ("sellingPrice" in payload) {
    product.selling_price =
      payload.sellingPrice === null ? null : Number(payload.sellingPrice);
  }
  if ("isPerishable" in payload) product.is_perishable = Boolean(payload.isPerishable);
  if ("shelfLifeDays" in payload) {
    product.shelf_life_days =
      payload.shelfLifeDays === null ? null : Number(payload.shelfLifeDays);
  }
  if ("notes" in payload) product.notes = payload.notes ? String(payload.notes) : null;
  if ("isActive" in payload) product.is_active = Boolean(payload.isActive);
  product.updated_at = nowIso();
}

function addBatchRow(
  product: Row,
  quantity: number,
  expiryDate: string | null,
  batchNo: string | null,
  invoiceId: number | null,
  note: string | null
): Row {
  const id = nextId("batch");
  const batch = {
    id,
    product_id: Number(product.id),
    store_id: 1,
    batch_no: batchNo || `BN-${product.sku || product.id}-${pad(id, 2)}`,
    expiry_date: expiryDate,
    received_date: todayKey(),
    quantity,
    status: "active",
    invoice_id: invoiceId,
    note,
    created_by: currentUserId(),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.batches.push(batch);
  return batch;
}

function deductBatchesFifo(productId: number, quantity: number): void {
  let remaining = quantity;
  const batches = db.batches
    .filter(
      (batch) =>
        Number(batch.product_id) === productId &&
        batch.status === "active" &&
        Number(batch.quantity) > 0
    )
    .sort((a, b) =>
      String(a.expiry_date ?? "9999-12-31").localeCompare(
        String(b.expiry_date ?? "9999-12-31")
      )
    );

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(Number(batch.quantity), remaining);
    batch.quantity = Number(batch.quantity) - take;
    remaining -= take;
    if (Number(batch.quantity) <= 0) batch.status = "depleted";
    batch.updated_at = nowIso();
  }
}

function restoreBatches(productId: number, quantity: number): void {
  const product = db.products.find((p) => Number(p.id) === productId);
  if (!product?.is_perishable) return;
  const batch = db.batches
    .filter((b) => Number(b.product_id) === productId && b.status === "active")
    .sort((a, b) =>
      String(b.expiry_date ?? "").localeCompare(String(a.expiry_date ?? ""))
    )[0];
  if (batch) {
    batch.quantity = Number(batch.quantity) + quantity;
    batch.updated_at = nowIso();
    return;
  }
  addBatchRow(product, quantity, null, null, null, "销售作废回滚");
}

function reverseInvoiceInventory(invoice: Row, reason: string): void {
  const items = db.invoiceItems.filter(
    (item) => Number(item.invoice_id) === Number(invoice.id)
  );
  for (const item of items) {
    const inventory = inventoryOf(Number(item.product_id));
    const before = Number(inventory.quantity);
    const after = Math.max(0, before - Number(item.quantity));
    inventory.quantity = after;
    inventory.updated_at = nowIso();
    addInventoryLog({
      product_id: Number(item.product_id),
      type: "adjust",
      quantity: -Number(item.quantity),
      quantity_before: before,
      quantity_after: after,
      invoice_id: Number(invoice.id),
      reason,
    });
  }
}

function assertInvoiceNumberAvailable(invoiceNumber: string, excludeId?: number): void {
  const duplicate = db.invoices.some(
    (inv) =>
      inv.invoice_number === invoiceNumber && Number(inv.id) !== Number(excludeId ?? -1)
  );
  if (duplicate) {
    throw new DemoError(400, "DUPLICATE_INVOICE", `发票号 ${invoiceNumber} 已存在`);
  }
}

function confirmInvoiceFromPayload(invoice: Row, payload: Row) {
  const supplier = supplierOf(payload.supplierId);
  if (!supplier) throw new DemoError(400, "VALIDATION_ERROR", "请选择供应商后再确认入库");
  const inputs = Array.isArray(payload.items) ? (payload.items as Row[]) : [];
  if (inputs.length === 0) {
    throw new DemoError(400, "VALIDATION_ERROR", "发票至少需要一条商品明细");
  }

  const invoiceNumber = String(payload.invoiceNumber ?? invoice.invoice_number).trim();
  if (!invoiceNumber) throw new DemoError(400, "VALIDATION_ERROR", "请填写发票号");
  assertInvoiceNumberAvailable(invoiceNumber, Number(invoice.id));

  db.invoiceItems = db.invoiceItems.filter(
    (item) => Number(item.invoice_id) !== Number(invoice.id)
  );

  let newProductsCreated = 0;
  let inventoryUpdated = 0;
  let computedSubtotal = 0;
  const priceAlerts: Row[] = [];

  for (const raw of inputs) {
    const quantity = Number(raw.quantity) || 0;
    if (quantity <= 0) {
      throw new DemoError(400, "VALIDATION_ERROR", "商品数量必须大于 0");
    }
    const unitPrice = Number(raw.unitPrice) || 0;
    const lineTotal =
      raw.lineTotal !== undefined && raw.lineTotal !== null
        ? Number(raw.lineTotal)
        : round2(quantity * unitPrice);

    let product = raw.productId
      ? db.products.find(
          (p) => Number(p.id) === Number(raw.productId) && !p.deleted_at
        )
      : undefined;

    if (!product) {
      product = createProductRecord({
        nameEn: raw.productNameEn || `新商品 ${invoice.id}-${computedSubtotal}`,
        nameZh: raw.productNameZh ?? null,
        defaultUnit: raw.unit || "Case",
        defaultPrice: unitPrice,
        sellingPrice: round2(unitPrice * 1.3),
        categoryId: raw.categoryId ?? db.categories[0]?.id ?? null,
        defaultSupplierId: supplier.id,
        isPerishable: false,
        isActive: true,
      });
      newProductsCreated += 1;
    }

    const inventory = inventoryOf(Number(product.id));
    const before = Number(inventory.quantity);
    const after = before + quantity;
    inventory.quantity = after;
    inventory.last_restock_date = dateKey(payload.invoiceDate) || todayKey();
    inventory.last_restock_quantity = quantity;
    inventory.updated_at = nowIso();
    inventoryUpdated += 1;

    addInventoryLog({
      product_id: Number(product.id),
      type: "inbound",
      quantity,
      quantity_before: before,
      quantity_after: after,
      invoice_id: Number(invoice.id),
    });

    if (product.is_perishable) {
      const shelfLife = Number(product.shelf_life_days) || 0;
      const expiryDate =
        shelfLife > 0
          ? addDaysToKey(dateKey(payload.invoiceDate) || todayKey(), shelfLife)
          : null;
      addBatchRow(product, quantity, expiryDate, null, Number(invoice.id), null);
    }

    const previousPrice = Number(product.default_price) || 0;
    if (previousPrice > 0 && unitPrice > 0) {
      const changePercent = round2(
        ((unitPrice - previousPrice) / previousPrice) * 100
      );
      const threshold =
        Number(db.settings.price_alert_threshold || 0.1) * 100;
      if (Math.abs(changePercent) >= threshold) {
        priceAlerts.push({
          productId: Number(product.id),
          productName: product.name_en,
          previousPrice,
          currentPrice: unitPrice,
          changePercent,
        });
      }
      product.default_price = unitPrice;
    }
    product.updated_at = nowIso();

    db.invoiceItems.push({
      id: nextId("invoiceItem"),
      invoice_id: Number(invoice.id),
      product_id: Number(product.id),
      raw_name_en: raw.productNameEn || product.name_en,
      raw_name_zh: raw.productNameZh ?? product.name_zh ?? null,
      raw_product_code: raw.productCode ?? null,
      raw_product_number: raw.productNumber ?? null,
      raw_un: raw.un ?? raw.unit ?? product.default_unit,
      raw_tax_code: raw.taxCode ?? null,
      quantity,
      unit: raw.unit || product.default_unit,
      unit_price: unitPrice,
      line_total: lineTotal,
    });
    computedSubtotal += lineTotal;
  }

  const subtotal =
    payload.subtotal === undefined || payload.subtotal === null
      ? round2(computedSubtotal)
      : Number(payload.subtotal);
  const hasTax = Boolean(payload.hasTax);
  const taxAmount =
    payload.taxAmount === undefined || payload.taxAmount === null
      ? 0
      : Number(payload.taxAmount);
  const grandTotal =
    payload.grandTotal === undefined || payload.grandTotal === null
      ? round2(subtotal + taxAmount)
      : Number(payload.grandTotal);

  invoice.supplier_id = Number(supplier.id);
  invoice.supplier_name = supplier.name;
  invoice.invoice_number = invoiceNumber;
  invoice.invoice_date = dateKey(payload.invoiceDate) || todayKey();
  invoice.customer_code = payload.customerCode ?? null;
  invoice.subtotal = subtotal;
  invoice.has_tax = hasTax ? 1 : 0;
  invoice.tax_amount = taxAmount;
  invoice.grand_total = grandTotal;
  invoice.status = "confirmed";
  invoice.confirmed_by = currentUserId();
  invoice.confirmed_at = nowIso();
  invoice.notes = payload.notes ?? invoice.notes ?? null;
  invoice.updated_at = nowIso();

  for (const alert of priceAlerts) {
    addNotification({
      type: "price_alert",
      title: "价格异常波动",
      message: `${alert.productName} 进价由 ${alert.previousPrice.toFixed(2)} 变为 ${alert.currentPrice.toFixed(2)}（${alert.changePercent > 0 ? "+" : ""}${alert.changePercent}%）`,
      link: "/analytics",
    });
  }
  addAudit("confirm_invoice", "invoice", Number(invoice.id), {
    invoiceNumber,
  });

  return {
    invoiceId: Number(invoice.id),
    status: invoice.status,
    newProductsCreated,
    inventoryUpdated,
    priceAlerts,
  };
}

function fileTypeFromName(fileName: string): "pdf" | "image" | "excel" {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  return "image";
}

function nextInvoiceNumber(invoiceId: number): string {
  let number = `INV-OCR-${pad(invoiceId, 4)}`;
  let suffix = 1;
  while (db.invoices.some((inv) => inv.invoice_number === number)) {
    suffix += 1;
    number = `INV-OCR-${pad(invoiceId, 4)}-${suffix}`;
  }
  return number;
}

function buildUploadedInvoice(fileName: string) {
  const fileType = fileTypeFromName(fileName);
  const hash = hashText(fileName);
  const supplier = db.suppliers[hash % db.suppliers.length];
  const supplierPool = db.products.filter(
    (p) => Number(p.default_supplier_id) === Number(supplier.id)
  );
  const pool = supplierPool.length >= 3 ? supplierPool : db.products;
  const start = hash % pool.length;
  const count = Math.min(5, pool.length);
  const chosen = Array.from(
    { length: count },
    (_, index) => pool[(start + index) % pool.length]
  );

  const invoiceId = nextRowId(db.invoices);
  const invoiceNumber = nextInvoiceNumber(invoiceId);
  const lineItems: Row[] = chosen.map((product, index) => {
    const quantity = 1 + ((hash + index * 7) % 12);
    const unitPrice = round2(
      Number(product.default_price) * (0.9 + ((hash + index * 3) % 15) / 100)
    );
    return {
      productId: Number(product.id),
      matchedProduct: {
        id: Number(product.id),
        nameEn: product.name_en,
        nameZh: product.name_zh ?? null,
        confidence: Math.min(0.99, round2(0.86 + ((hash + index) % 14) / 100)),
      },
      productNameEn: product.name_en,
      productNameZh: product.name_zh ?? null,
      productCode: product.sku,
      productNumber: null,
      un: product.default_unit,
      taxCode: hash % 3 === 0 ? null : "H",
      quantity,
      unit: product.default_unit,
      unitPrice,
      lineTotal: round2(quantity * unitPrice),
    };
  });

  if (hash % 4 === 0) {
    lineItems.push({
      productId: null,
      matchedProduct: null,
      productNameEn: "Seasonal Special",
      productNameZh: "时令新品",
      productCode: null,
      productNumber: null,
      un: "Case",
      taxCode: "H",
      quantity: 6,
      unit: "Case",
      unitPrice: 19.9,
      lineTotal: 119.4,
    });
  }

  const subtotal = round2(sumBy(lineItems, (item) => Number(item.lineTotal)));
  const hasTax = hash % 3 !== 0;
  const taxAmount = hasTax ? round2(subtotal * 0.13) : 0;
  const grandTotal = round2(subtotal + taxAmount);
  const recognized = {
    supplierName: supplier.name,
    supplierCode: supplier.code,
    supplierAddress: supplier.address,
    supplierContact: `${supplier.contact_name} · ${supplier.phone}`,
    invoiceNumber,
    invoiceDate: todayKey(),
    customerCode: `C-${pad(1000 + invoiceId, 4)}`,
    items: lineItems,
    salesTotal: subtotal,
    taxTotal: taxAmount,
    total: grandTotal,
    subtotal,
    hasTax,
    taxAmount,
    grandTotal,
  };

  const invoice = {
    id: invoiceId,
    supplier_id: null,
    supplier_name: null,
    invoice_number: invoiceNumber,
    invoice_date: todayKey(),
    customer_code: recognized.customerCode,
    subtotal,
    has_tax: hasTax ? 1 : 0,
    tax_amount: taxAmount,
    grand_total: grandTotal,
    file_path: `demo/${fileName}`,
    file_type: fileType,
    ocr_method: "demo_ocr",
    status: "pending",
    uploaded_by: currentUserId(),
    confirmed_by: null,
    confirmed_at: null,
    notes: null,
    ocr_raw_result: JSON.stringify({
      supplierName: recognized.supplierName,
      supplierCode: recognized.supplierCode,
      supplierAddress: recognized.supplierAddress,
      supplierContact: recognized.supplierContact,
      invoiceNumber,
      invoiceDate: recognized.invoiceDate,
      customerCode: recognized.customerCode,
      items: lineItems.map((item) => ({
        productNameEn: item.productNameEn,
        productNameZh: item.productNameZh,
        productCode: item.productCode,
        productNumber: item.productNumber,
        un: item.un,
        taxCode: item.taxCode,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      salesTotal: subtotal,
      taxTotal: taxAmount,
      total: grandTotal,
      subtotal,
      hasTax,
      taxAmount,
      grandTotal,
    }),
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  db.invoices.push(invoice);
  for (const item of lineItems) {
    db.invoiceItems.push({
      id: nextId("invoiceItem"),
      invoice_id: invoiceId,
      product_id: null,
      raw_name_en: item.productNameEn,
      raw_name_zh: item.productNameZh,
      raw_product_code: item.productCode,
      raw_product_number: item.productNumber,
      raw_un: item.un,
      raw_tax_code: item.taxCode,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unitPrice,
      line_total: item.lineTotal,
    });
  }

  return { invoice, recognized, fileType, fileName };
}

function createSaleOrder(payload: Row): Row {
  const inputs = Array.isArray(payload.items) ? (payload.items as Row[]) : [];
  if (inputs.length === 0) {
    throw new DemoError(400, "VALIDATION_ERROR", "销售单至少需要一项商品");
  }

  const lines = inputs.map((input) => {
    const product = db.products.find(
      (p) => Number(p.id) === Number(input.productId) && !p.deleted_at
    );
    if (!product) {
      throw new DemoError(400, "VALIDATION_ERROR", `商品 #${input.productId} 不存在`);
    }
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new DemoError(400, "VALIDATION_ERROR", "销售数量必须大于 0");
    }
    const unitPrice = Number(input.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new DemoError(400, "VALIDATION_ERROR", "销售单价无效");
    }
    const inventory = inventoryOf(Number(product.id));
    if (Number(inventory.quantity) < quantity) {
      throw new DemoError(
        400,
        "INSUFFICIENT_STOCK",
        `库存不足：${product.name_en} 当前库存 ${inventory.quantity}`
      );
    }
    return { product, quantity, unitPrice, unit: product.default_unit };
  });

  const orderId = nextRowId(db.salesOrders);
  const order = {
    id: orderId,
    store_id: 1,
    order_no: `SO-${todayKey().replace(/-/g, "")}-${pad(orderId, 4)}`,
    total: round2(sumBy(lines, (line) => line.unitPrice * line.quantity)),
    status: "completed",
    note: payload.note ?? null,
    sold_by: currentUserId(),
    voided_by: null,
    voided_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.salesOrders.push(order);

  for (const line of lines) {
    const inventory = inventoryOf(Number(line.product.id));
    const before = Number(inventory.quantity);
    const after = before - line.quantity;
    inventory.quantity = after;
    inventory.updated_at = nowIso();
    addInventoryLog({
      product_id: Number(line.product.id),
      type: "sale",
      quantity: line.quantity,
      quantity_before: before,
      quantity_after: after,
      sales_order_id: orderId,
      reason: "销售出库",
    });
    deductBatchesFifo(Number(line.product.id), line.quantity);
    db.salesItems.push({
      id: nextId("salesItem"),
      sales_order_id: orderId,
      product_id: Number(line.product.id),
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unitPrice,
      cost_price: Number(line.product.default_price ?? 0),
      line_total: round2(line.unitPrice * line.quantity),
      created_at: nowIso(),
    });
  }

  addAudit("create_sale", "sales_order", orderId, {
    total: order.total,
    orderNo: order.order_no,
  });
  return order;
}

function voidSaleOrder(order: Row): Row {
  if (order.status !== "completed") {
    throw new DemoError(400, "INVALID_STATUS", "只有已完成的销售单可以作废");
  }
  const items = db.salesItems.filter(
    (item) => Number(item.sales_order_id) === Number(order.id)
  );
  for (const item of items) {
    const inventory = inventoryOf(Number(item.product_id));
    const before = Number(inventory.quantity);
    const after = before + Number(item.quantity);
    inventory.quantity = after;
    inventory.updated_at = nowIso();
    addInventoryLog({
      product_id: Number(item.product_id),
      type: "adjust",
      quantity: Number(item.quantity),
      quantity_before: before,
      quantity_after: after,
      sales_order_id: Number(order.id),
      reason: "销售作废回滚",
    });
    restoreBatches(Number(item.product_id), Number(item.quantity));
  }
  order.status = "voided";
  order.voided_by = currentUserId();
  order.voided_at = nowIso();
  order.updated_at = nowIso();
  addAudit("void_sale", "sales_order", Number(order.id), { orderNo: order.order_no });
  return order;
}

function readFile(form: FormData | null, key = "file"): File | null {
  const value = form?.get(key);
  return typeof File !== "undefined" && value instanceof File ? value : null;
}

function emitProgress(config: InternalAxiosRequestConfig, percent: number): void {
  const event: AxiosProgressEvent = {
    loaded: percent,
    total: 100,
    bytes: percent,
    lengthComputable: true,
    progress: percent / 100,
  };
  config.onUploadProgress?.(event);
}

function priceHistoryRows(productId: number, q: Query) {
  const months = qNum(q, "months") ?? 6;
  const groupBy = qStr(q, "groupBy") || "invoice";
  const supplierId = qNum(q, "supplierId");
  const since = keyShift(-months * 30);
  const entries: Row[] = [];

  for (const invoice of db.invoices) {
    if (invoice.status !== "confirmed") continue;
    if (dateKey(invoice.invoice_date) < since) continue;
    if (supplierId && Number(invoice.supplier_id) !== supplierId) continue;
    for (const item of db.invoiceItems) {
      if (
        Number(item.invoice_id) !== Number(invoice.id) ||
        Number(item.product_id) !== productId
      ) {
        continue;
      }
      entries.push({
        date: dateKey(invoice.invoice_date),
        unitPrice: Number(item.unit_price),
        quantity: Number(item.quantity),
        supplierName: invoice.supplier_name ?? null,
        invoiceNumber: invoice.invoice_number,
        createdAt: invoice.created_at,
      });
    }
  }

  entries.sort(
    (a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      String(a.createdAt).localeCompare(String(b.createdAt))
  );

  let result = entries.map((entry) => ({
    date: entry.date,
    unitPrice: entry.unitPrice,
    quantity: entry.quantity,
    supplierName: entry.supplierName,
    invoiceNumber: entry.invoiceNumber,
  }));

  if (groupBy === "month") {
    const groups = new Map<string, Row[]>();
    for (const entry of entries) {
      const month = dateKey(entry.date).slice(0, 7);
      const list = groups.get(month) ?? [];
      list.push(entry);
      groups.set(month, list);
    }
    result = Array.from(groups.entries()).map(([month, rows]) => ({
      date: `${month}-01`,
      unitPrice: round2(sumBy(rows, (row) => row.unitPrice) / rows.length),
      quantity: sumBy(rows, (row) => row.quantity),
      supplierName: rows[rows.length - 1]?.supplierName ?? null,
      invoiceNumber: null,
    }));
  }

  const limit = qNum(q, "limit");
  return limit ? result.slice(-limit) : result;
}

/* ── request dispatcher ────────────────────────────────────────── */

async function handleRequest(
  method: string,
  pathname: string,
  q: Query,
  payload: unknown,
  config: InternalAxiosRequestConfig
): Promise<AxiosResponse> {
  const p = pathname.replace(/\/+$/, "") || "/";
  let match: RegExpMatchArray | null = null;

  /* ── auth ────────────────────────────────────────────────────── */
  if (method === "POST" && p === "/auth/login") {
    const row = asRow(payload);
    const username = String(row.username ?? "").trim();
    const password = String(row.password ?? "");
    const user = db.users.find((u) => u.username === username);
    if (!user || user.password !== password) {
      return fail(401, "INVALID_CREDENTIALS", "用户名或密码错误", config);
    }
    if (!user.is_active) {
      return fail(403, "ACCOUNT_DISABLED", "该账号已被禁用，请联系管理员", config);
    }
    user.last_login_at = nowIso();
    addAudit("login", "user", Number(user.id), { username: user.username });
    persist();
    return ok(
      { token: `demo-token-${user.id}`, expiresIn: 86400, user: authUser(user) },
      config
    );
  }

  if (method === "GET" && p === "/auth/me") {
    const token = localStorage.getItem(STORAGE_KEYS.token);
    const tokenMatch = /^demo-token-(\d+)$/.exec(token ?? "");
    const user = tokenMatch
      ? db.users.find((u) => Number(u.id) === Number(tokenMatch[1]))
      : null;
    if (!user) return fail(401, "UNAUTHORIZED", "登录状态已失效，请重新登录", config);
    return ok(authUser(user), config);
  }

  if (method === "POST" && p === "/auth/logout") {
    return ok(null, config);
  }

  if (method === "PUT" && p === "/auth/password") {
    const row = asRow(payload);
    const user = db.users.find((u) => Number(u.id) === currentUserId());
    if (!user) return fail(401, "UNAUTHORIZED", "登录状态已失效，请重新登录", config);
    if (user.password !== String(row.currentPassword ?? "")) {
      return fail(400, "INVALID_PASSWORD", "当前密码不正确", config);
    }
    const nextPassword = String(row.newPassword ?? "");
    if (nextPassword.length < 6) {
      return fail(400, "VALIDATION_ERROR", "新密码至少需要 6 位", config);
    }
    user.password = nextPassword;
    addAudit("change_password", "user", Number(user.id));
    persist();
    return ok(null, config);
  }

  /* ── products ────────────────────────────────────────────────── */
  if (method === "GET" && p === "/products") {
    const keyword = qStr(q, "keyword").toLowerCase();
    const categoryId = qNum(q, "categoryId");
    const supplierId = qNum(q, "supplierId");
    const isActive = qBool(q, "isActive");
    const categoryIds = categoryId ? categoryIdsFor(categoryId) : null;
    const rows = db.products
      .filter((product) => !product.deleted_at)
      .filter((product) => {
        if (isActive !== null && Boolean(product.is_active) !== isActive) return false;
        if (supplierId && Number(product.default_supplier_id) !== supplierId) return false;
        if (
          categoryIds &&
          (product.category_id === null || !categoryIds.has(Number(product.category_id)))
        ) {
          return false;
        }
        if (!keyword) return true;
        return [product.name_en, product.name_zh, product.sku, product.barcode]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      })
      .sort((a, b) => String(a.name_en).localeCompare(String(b.name_en)));
    return ok(paginate(rows, q), config);
  }

  if (method === "GET" && p === "/products/export") {
    const rows = db.products.filter((product) => !product.deleted_at);
    const csv = toCsv(
      ["SKU", "Barcode", "Name EN", "Name ZH", "Unit", "Cost", "Selling", "Active"],
      rows.map((product) => [
        product.sku,
        product.barcode,
        product.name_en,
        product.name_zh,
        product.default_unit,
        product.default_price,
        product.selling_price,
        product.is_active ? "yes" : "no",
      ])
    );
    return raw(new Blob([csv], { type: "text/csv;charset=utf-8" }), config);
  }

  if (method === "POST" && p === "/products/import") {
    const form =
      typeof FormData !== "undefined" && payload instanceof FormData ? payload : null;
    const file = readFile(form);
    if (!file) throw new DemoError(400, "VALIDATION_ERROR", "请选择 CSV 文件");
    const text = await file.text().catch(() => "");
    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim());
    if (lines.length < 2) {
      throw new DemoError(400, "VALIDATION_ERROR", "CSV 文件没有可导入的数据行");
    }
    const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
    const indexOf = (...names: string[]) => {
      for (const name of names) {
        const index = headers.indexOf(name);
        if (index >= 0) return index;
      }
      return -1;
    };
    const skuIndex = indexOf("sku");
    const nameEnIndex = indexOf("name_en", "name", "product");
    const nameZhIndex = indexOf("name_zh");
    const unitIndex = indexOf("unit", "default_unit");
    const priceIndex = indexOf("price", "default_price");
    let created = 0;
    let skipped = 0;

    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((col) => col.trim().replace(/^"|"$/g, ""));
      const nameEn = nameEnIndex >= 0 ? cols[nameEnIndex] : "";
      const sku = skuIndex >= 0 ? cols[skuIndex] : "";
      if (!nameEn && !sku) {
        skipped += 1;
        continue;
      }
      if (sku && db.products.some((product) => product.sku === sku)) {
        skipped += 1;
        continue;
      }
      createProductRecord({
        sku: sku || null,
        nameEn: nameEn || sku,
        nameZh: nameZhIndex >= 0 ? cols[nameZhIndex] || null : null,
        defaultUnit: unitIndex >= 0 ? cols[unitIndex] || "Case" : "Case",
        defaultPrice: priceIndex >= 0 ? Number(cols[priceIndex]) || null : null,
        isActive: true,
      });
      created += 1;
    }
    addAudit("import_products", "product", null, { created, skipped });
    persist();
    return ok({ created, skipped, total: lines.length - 1 }, config);
  }

  match = p.match(/^\/products\/by-barcode\/(.+)$/);
  if (method === "GET" && match) {
    const barcode = decodeURIComponent(match[1]);
    const product = db.products.find(
      (row) => !row.deleted_at && String(row.barcode ?? "") === barcode
    );
    if (!product) {
      return fail(404, "NOT_FOUND", `未找到条码 ${barcode} 对应的商品`, config);
    }
    return ok(product, config);
  }

  match = p.match(/^\/products\/(\d+)\/price-history$/);
  if (method === "GET" && match) {
    return ok(priceHistoryRows(Number(match[1]), q), config);
  }

  match = p.match(/^\/products\/(\d+)\/image$/);
  if (method === "POST" && match) {
    const product = db.products.find((row) => Number(row.id) === Number(match?.[1]));
    if (!product) return fail(404, "NOT_FOUND", "商品不存在", config);
    const form =
      typeof FormData !== "undefined" && payload instanceof FormData ? payload : null;
    const file = readFile(form);
    if (!file) throw new DemoError(400, "VALIDATION_ERROR", "请选择图片文件");
    const imageUrl = URL.createObjectURL(file);
    product.image_url = imageUrl;
    product.updated_at = nowIso();
    persist();
    return ok({ imageUrl }, config);
  }

  match = p.match(/^\/products\/(\d+)$/);
  if (match) {
    const productId = Number(match[1]);
    const product = db.products.find((row) => Number(row.id) === productId && !row.deleted_at);

    if (method === "GET") {
      if (!product) return fail(404, "NOT_FOUND", "商品不存在", config);
      return ok(product, config);
    }

    if (method === "PUT") {
      if (!product) return fail(404, "NOT_FOUND", "商品不存在", config);
      applyProductPayload(product, asRow(payload));
      addAudit("update_product", "product", productId, { nameEn: product.name_en });
      persist();
      return ok(null, config);
    }

    if (method === "DELETE") {
      if (!product) return fail(404, "NOT_FOUND", "商品不存在", config);
      product.deleted_at = nowIso();
      product.is_active = false;
      product.updated_at = nowIso();
      addAudit("delete_product", "product", productId, { nameEn: product.name_en });
      persist();
      return ok(null, config);
    }
  }

  if (method === "POST" && p === "/products") {
    const row = asRow(payload);
    if (!String(row.nameEn ?? "").trim()) {
      return fail(400, "VALIDATION_ERROR", "请填写商品英文名", config);
    }
    const product = createProductRecord(row);
    addAudit("create_product", "product", Number(product.id), {
      nameEn: product.name_en,
    });
    persist();
    return ok({ id: Number(product.id) }, config);
  }

  /* ── categories ──────────────────────────────────────────────── */
  if (method === "GET" && p === "/categories") {
    return ok(categoryTree(), config);
  }
  if (method === "GET" && p === "/categories/flat") {
    return ok(
      db.categories
        .slice()
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((category) => ({
          ...category,
          productCount: productCountFor(Number(category.id)),
        })),
      config
    );
  }
  if (method === "POST" && p === "/categories") {
    const row = asRow(payload);
    if (!String(row.name ?? "").trim()) {
      return fail(400, "VALIDATION_ERROR", "请填写分类名称", config);
    }
    const id = nextRowId(db.categories);
    const category = {
      id,
      name: String(row.name),
      name_en: row.nameEn ? String(row.nameEn) : null,
      parent_id: row.parentId ? Number(row.parentId) : null,
      sort_order: Number(row.sortOrder ?? id),
    };
    db.categories.push(category);
    persist();
    return ok({ id }, config);
  }

  match = p.match(/^\/categories\/(\d+)$/);
  if (match) {
    const categoryId = Number(match[1]);
    const category = db.categories.find((row) => Number(row.id) === categoryId);
    if (!category) return fail(404, "NOT_FOUND", "分类不存在", config);
    if (method === "PUT") {
      const row = asRow(payload);
      if ("name" in row) category.name = String(row.name);
      if ("nameEn" in row) category.name_en = row.nameEn ? String(row.nameEn) : null;
      if ("parentId" in row) category.parent_id = row.parentId ? Number(row.parentId) : null;
      if ("sortOrder" in row) category.sort_order = Number(row.sortOrder);
      persist();
      return ok(null, config);
    }
    if (method === "DELETE") {
      const hasProducts = db.products.some(
        (product) => !product.deleted_at && Number(product.category_id) === categoryId
      );
      const hasChildren = db.categories.some(
        (row) => Number(row.parent_id) === categoryId
      );
      if (hasProducts || hasChildren) {
        return fail(
          400,
          "CATEGORY_IN_USE",
          "该分类下仍有商品或子分类，无法删除",
          config
        );
      }
      db.categories = db.categories.filter((row) => Number(row.id) !== categoryId);
      persist();
      return ok(null, config);
    }
  }

  /* ── suppliers ───────────────────────────────────────────────── */
  if (method === "GET" && p === "/suppliers") {
    const keyword = qStr(q, "keyword").toLowerCase();
    const rows = db.suppliers
      .filter((supplier) => {
        if (!keyword) return true;
        return [supplier.name, supplier.code, supplier.contact_name, supplier.phone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return ok(paginate(rows, q), config);
  }

  if (method === "POST" && p === "/suppliers") {
    const row = asRow(payload);
    if (!String(row.name ?? "").trim()) {
      return fail(400, "VALIDATION_ERROR", "请填写供应商名称", config);
    }
    const id = nextRowId(db.suppliers);
    db.suppliers.push({
      id,
      name: String(row.name),
      code: row.code ? String(row.code) : null,
      contact_name: row.contactName ? String(row.contactName) : null,
      phone: row.phone ? String(row.phone) : null,
      email: row.email ? String(row.email) : null,
      address: row.address ? String(row.address) : null,
      notes: row.notes ? String(row.notes) : null,
      is_active: true,
      created_at: nowIso(),
    });
    addAudit("create_supplier", "supplier", id, { name: row.name });
    persist();
    return ok({ id }, config);
  }

  match = p.match(/^\/suppliers\/(\d+)$/);
  if (match) {
    const supplierId = Number(match[1]);
    const supplier = supplierOf(supplierId);
    if (!supplier) return fail(404, "NOT_FOUND", "供应商不存在", config);
    if (method === "GET") return ok(supplier, config);
    if (method === "PUT") {
      const row = asRow(payload);
      if ("name" in row) supplier.name = String(row.name);
      if ("code" in row) supplier.code = row.code ? String(row.code) : null;
      if ("contactName" in row) {
        supplier.contact_name = row.contactName ? String(row.contactName) : null;
      }
      if ("phone" in row) supplier.phone = row.phone ? String(row.phone) : null;
      if ("email" in row) supplier.email = row.email ? String(row.email) : null;
      if ("address" in row) supplier.address = row.address ? String(row.address) : null;
      if ("notes" in row) supplier.notes = row.notes ? String(row.notes) : null;
      addAudit("update_supplier", "supplier", supplierId, { name: supplier.name });
      persist();
      return ok(null, config);
    }
    if (method === "DELETE") {
      const used = db.invoices.some((inv) => Number(inv.supplier_id) === supplierId);
      if (used) {
        return fail(
          400,
          "SUPPLIER_IN_USE",
          "该供应商已有发票记录，无法删除",
          config
        );
      }
      db.suppliers = db.suppliers.filter((row) => Number(row.id) !== supplierId);
      persist();
      return ok(null, config);
    }
  }

  /* ── invoices ────────────────────────────────────────────────── */
  if (method === "GET" && p === "/invoices") {
    const status = qStr(q, "status");
    const keyword = qStr(q, "keyword").toLowerCase();
    const supplierId = qNum(q, "supplierId");
    const dateFrom = qStr(q, "dateFrom");
    const dateTo = qStr(q, "dateTo");
    const rows = db.invoices
      .filter((invoice) => {
        if (status && invoice.status !== status) return false;
        if (supplierId && Number(invoice.supplier_id) !== supplierId) return false;
        if (dateFrom && dateKey(invoice.invoice_date) < dateFrom) return false;
        if (dateTo && dateKey(invoice.invoice_date) > dateTo) return false;
        if (!keyword) return true;
        return [invoice.invoice_number, invoice.supplier_name, invoice.customer_code]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(invoiceSummary);
    return ok(paginate(rows, q), config);
  }

  if (method === "POST" && p === "/invoices/upload") {
    const form =
      typeof FormData !== "undefined" && payload instanceof FormData ? payload : null;
    const file = readFile(form);
    const fileName = file?.name ?? "invoice-demo.pdf";
    for (let percent = 10; percent <= 100; percent += 15) {
      emitProgress(config, Math.min(100, percent));
      await wait(70);
    }
    emitProgress(config, 100);
    await wait(550);

    const result = buildUploadedInvoice(fileName);
    addAudit("upload_invoice", "invoice", Number(result.invoice.id), {
      invoiceNumber: result.invoice.invoice_number,
      fileName,
    });
    persist();
    return ok(
      {
        invoiceId: Number(result.invoice.id),
        ocrMethod: result.invoice.ocr_method,
        recognized: result.recognized,
        filePath: result.invoice.file_path,
        fileType: result.fileType,
      },
      config
    );
  }

  match = p.match(/^\/invoices\/(\d+)\/confirm$/);
  if (method === "POST" && match) {
    const invoice = db.invoices.find((row) => Number(row.id) === Number(match?.[1]));
    if (!invoice) return fail(404, "NOT_FOUND", "发票不存在", config);
    if (invoice.status === "confirmed") {
      return fail(400, "INVALID_STATUS", "该发票已确认入库，请勿重复操作", config);
    }
    const result = confirmInvoiceFromPayload(invoice, asRow(payload));
    persist();
    return ok(result, config);
  }

  match = p.match(/^\/invoices\/(\d+)\/rollback-confirm$/);
  if (method === "POST" && match) {
    const invoice = db.invoices.find((row) => Number(row.id) === Number(match?.[1]));
    if (!invoice) return fail(404, "NOT_FOUND", "发票不存在", config);
    if (invoice.status !== "confirmed") {
      return fail(400, "INVALID_STATUS", "只有已确认的发票可以回滚", config);
    }
    const reason = String(asRow(payload).reason ?? "管理员回滚");
    reverseInvoiceInventory(invoice, reason);
    invoice.status = "pending";
    invoice.confirmed_by = null;
    invoice.confirmed_at = null;
    invoice.updated_at = nowIso();
    addAudit("rollback_invoice", "invoice", Number(invoice.id), { reason });
    persist();
    return ok(invoiceDetail(invoice), config);
  }

  match = p.match(/^\/invoices\/(\d+)\/reject$/);
  if (method === "POST" && match) {
    const invoice = db.invoices.find((row) => Number(row.id) === Number(match?.[1]));
    if (!invoice) return fail(404, "NOT_FOUND", "发票不存在", config);
    if (invoice.status === "confirmed") {
      return fail(400, "INVALID_STATUS", "已确认的发票不能直接驳回，请先回滚", config);
    }
    const reason = String(asRow(payload).reason ?? "人工驳回");
    invoice.status = "rejected";
    invoice.notes = reason;
    invoice.updated_at = nowIso();
    addAudit("reject_invoice", "invoice", Number(invoice.id), { reason });
    persist();
    return ok(null, config);
  }

  match = p.match(/^\/invoices\/(\d+)$/);
  if (match) {
    const invoiceId = Number(match[1]);
    const invoice = db.invoices.find((row) => Number(row.id) === invoiceId);

    if (method === "GET") {
      if (!invoice) return fail(404, "NOT_FOUND", "发票不存在", config);
      return ok(invoiceDetail(invoice), config);
    }

    if (method === "PUT") {
      if (!invoice) return fail(404, "NOT_FOUND", "发票不存在", config);
      const row = asRow(payload);
      const supplier = supplierOf(row.supplierId);
      if (supplier) {
        invoice.supplier_id = Number(supplier.id);
        invoice.supplier_name = supplier.name;
      }
      const invoiceNumber = String(row.invoiceNumber ?? invoice.invoice_number).trim();
      assertInvoiceNumberAvailable(invoiceNumber, invoiceId);
      invoice.invoice_number = invoiceNumber;
      invoice.invoice_date = dateKey(row.invoiceDate) || invoice.invoice_date;
      invoice.customer_code = row.customerCode ?? null;
      invoice.notes = row.notes ?? null;
      invoice.has_tax = row.hasTax ? 1 : 0;
      invoice.subtotal = row.subtotal !== undefined ? Number(row.subtotal) : invoice.subtotal;
      invoice.tax_amount =
        row.taxAmount !== undefined ? Number(row.taxAmount) : invoice.tax_amount;
      invoice.grand_total =
        row.grandTotal !== undefined ? Number(row.grandTotal) : invoice.grand_total;
      invoice.updated_at = nowIso();

      if (Array.isArray(row.items)) {
        db.invoiceItems = db.invoiceItems.filter(
          (item) => Number(item.invoice_id) !== invoiceId
        );
        for (const raw of row.items as Row[]) {
          db.invoiceItems.push({
            id: nextId("invoiceItem"),
            invoice_id: invoiceId,
            product_id: raw.productId ? Number(raw.productId) : null,
            raw_name_en: raw.productNameEn ?? null,
            raw_name_zh: raw.productNameZh ?? null,
            raw_product_code: raw.productCode ?? null,
            raw_product_number: raw.productNumber ?? null,
            raw_un: raw.un ?? null,
            raw_tax_code: raw.taxCode ?? null,
            quantity: Number(raw.quantity) || 0,
            unit: raw.unit ?? "Case",
            unit_price: Number(raw.unitPrice) || 0,
            line_total: Number(raw.lineTotal) || 0,
          });
        }
      }
      addAudit("update_invoice", "invoice", invoiceId, { invoiceNumber });
      persist();
      return ok(invoiceDetail(invoice), config);
    }

    if (method === "DELETE") {
      if (!invoice) return fail(404, "NOT_FOUND", "发票不存在", config);
      if (invoice.status === "confirmed") {
        reverseInvoiceInventory(invoice, "发票删除回滚");
      }
      db.invoiceItems = db.invoiceItems.filter(
        (item) => Number(item.invoice_id) !== invoiceId
      );
      db.invoices = db.invoices.filter((row) => Number(row.id) !== invoiceId);
      addAudit("delete_invoice", "invoice", invoiceId, {
        invoiceNumber: invoice.invoice_number,
      });
      persist();
      return ok(null, config);
    }
  }

  /* ── inventory ───────────────────────────────────────────────── */
  if (method === "GET" && p === "/inventory") {
    const keyword = qStr(q, "keyword").toLowerCase();
    const alertOnly = qBool(q, "alertOnly");
    const allRows = db.inventory
      .filter((inventory) => {
        const product = db.products.find(
          (row) => Number(row.id) === Number(inventory.product_id) && !row.deleted_at
        );
        return Boolean(product);
      })
      .map(inventoryView)
      .sort((a, b) => String(a.product.nameEn).localeCompare(String(b.product.nameEn)));

    const filtered = allRows.filter((row) => {
      if (alertOnly === true && !row.isLowStock) return false;
      if (!keyword) return true;
      return [row.product.nameEn, row.product.nameZh, row.product.sku]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });

    const summary = {
      totalProducts: allRows.length,
      lowStockCount: allRows.filter((row) => row.isLowStock).length,
      outOfStockCount: allRows.filter((row) => row.quantity === 0).length,
    };
    return ok({ ...paginate(filtered, q), summary }, config);
  }

  if (method === "POST" && p === "/inventory/stocktake") {
    const row = asRow(payload);
    const inputs = Array.isArray(row.items) ? (row.items as Row[]) : [];
    const results: Row[] = [];
    for (const input of inputs) {
      const productId = Number(input.productId);
      const inventory = inventoryOf(productId);
      const before = Number(inventory.quantity);
      const after = Math.max(0, Number(input.actualQuantity) || 0);
      if (after === before) continue;
      inventory.quantity = after;
      inventory.updated_at = nowIso();
      addInventoryLog({
        product_id: productId,
        type: "stocktake",
        quantity: Math.abs(after - before),
        quantity_before: before,
        quantity_after: after,
        reason: input.notes || row.notes || "库存盘点",
      });
      results.push({ productId, before, after });
    }
    addAudit("stocktake", "inventory", null, {
      adjustedCount: results.length,
      notes: row.notes ?? null,
    });
    persist();
    return ok({ adjustedCount: results.length, results }, config);
  }

  match = p.match(/^\/inventory\/(\d+)\/adjust$/);
  if (method === "POST" && match) {
    const productId = Number(match[1]);
    const row = asRow(payload);
    const inventory = inventoryOf(productId);
    const before = Number(inventory.quantity);
    const type = String(row.type ?? "adjust");
    const quantity = Number(row.quantity) || 0;
    let after = before;
    if (type === "stocktake") after = Math.max(0, quantity);
    else if (type === "out") after = Math.max(0, before - Math.abs(quantity));
    else after = Math.max(0, before + quantity);
    after = Math.round(after);

    if (after !== before) {
      inventory.quantity = after;
      inventory.updated_at = nowIso();
      addInventoryLog({
        product_id: productId,
        type: type === "out" ? "outbound" : type,
        quantity: Math.abs(after - before),
        quantity_before: before,
        quantity_after: after,
        reason: row.reason ? String(row.reason) : null,
      });
      addAudit("adjust_inventory", "inventory", productId, {
        before,
        after,
        type,
      });
      persist();
    }
    return ok({ before, after }, config);
  }

  match = p.match(/^\/inventory\/(\d+)\/safe-stock$/);
  if (method === "PUT" && match) {
    const productId = Number(match[1]);
    const inventory = inventoryOf(productId);
    inventory.safe_stock = Math.max(0, Number(asRow(payload).safeStock) || 0);
    inventory.updated_at = nowIso();
    persist();
    return ok(null, config);
  }

  match = p.match(/^\/inventory\/(\d+)\/logs$/);
  if (method === "GET" && match) {
    const productId = Number(match[1]);
    const rows = db.inventoryLogs
      .filter((log) => Number(log.product_id) === productId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((log) => {
        const invoice = db.invoices.find(
          (row) => Number(row.id) === Number(log.invoice_id)
        );
        return {
          id: Number(log.id),
          type: log.type,
          quantity: Number(log.quantity),
          quantityBefore: Number(log.quantity_before),
          quantityAfter: Number(log.quantity_after),
          invoiceNumber: invoice?.invoice_number ?? null,
          reason: log.reason ?? null,
          operatedBy: userName(log.operated_by),
          createdAt: log.created_at,
        };
      });
    return ok(paginate(rows, q), config);
  }

  /* ── batches ─────────────────────────────────────────────────── */
  if (method === "GET" && p === "/batches/expiring") {
    const days = qNum(q, "days") ?? 7;
    const items = expiringBatchRows(days).map((batch) => ({
      ...batch,
      expired: batch.expired,
    }));
    return ok(
      {
        days,
        expiredCount: items.filter((item) => item.expired).length,
        expiringCount: items.filter((item) => !item.expired).length,
        items,
      },
      config
    );
  }

  if (method === "GET" && p === "/batches") {
    const status = qStr(q, "status");
    const rows = db.batches
      .filter((batch) => !status || batch.status === status)
      .sort((a, b) =>
        String(a.expiry_date ?? "9999-12-31").localeCompare(
          String(b.expiry_date ?? "9999-12-31")
        )
      )
      .map(batchView);
    return ok(paginate(rows, q), config);
  }

  if (method === "POST" && p === "/batches") {
    const row = asRow(payload);
    const product = db.products.find(
      (item) => Number(item.id) === Number(row.productId) && !item.deleted_at
    );
    if (!product) return fail(400, "VALIDATION_ERROR", "请选择有效的商品", config);
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return fail(400, "VALIDATION_ERROR", "批次数量必须大于 0", config);
    }
    const batch = addBatchRow(
      product,
      quantity,
      row.expiryDate ? dateKey(row.expiryDate) : null,
      row.batchNo ? String(row.batchNo) : null,
      null,
      row.note ? String(row.note) : null
    );
    const inventory = inventoryOf(Number(product.id));
    const before = Number(inventory.quantity);
    inventory.quantity = before + quantity;
    inventory.updated_at = nowIso();
    addInventoryLog({
      product_id: Number(product.id),
      type: "inbound",
      quantity,
      quantity_before: before,
      quantity_after: Number(inventory.quantity),
      reason: `批次入库 ${batch.batch_no}`,
    });
    addAudit("create_batch", "batch", Number(batch.id), { batchNo: batch.batch_no });
    persist();
    return ok({ id: Number(batch.id) }, config);
  }

  match = p.match(/^\/batches\/(\d+)\/dispose$/);
  if (method === "POST" && match) {
    const batch = db.batches.find((row) => Number(row.id) === Number(match?.[1]));
    if (!batch) return fail(404, "NOT_FOUND", "批次不存在", config);
    if (batch.status !== "active") {
      return fail(400, "INVALID_STATUS", "该批次已不在有效状态", config);
    }
    const row = asRow(payload);
    const available = Number(batch.quantity);
    const quantity =
      row.quantity !== undefined && row.quantity !== null
        ? Math.min(available, Math.max(0, Number(row.quantity)))
        : available;
    if (quantity <= 0) {
      return fail(400, "VALIDATION_ERROR", "报损数量必须大于 0", config);
    }
    const reason = row.reason ? String(row.reason) : "过期报损";
    batch.quantity = available - quantity;
    if (Number(batch.quantity) <= 0) batch.status = "disposed";
    batch.note = reason;
    batch.updated_at = nowIso();

    const inventory = inventoryOf(Number(batch.product_id));
    const before = Number(inventory.quantity);
    inventory.quantity = Math.max(0, before - quantity);
    inventory.updated_at = nowIso();
    addInventoryLog({
      product_id: Number(batch.product_id),
      type: "outbound",
      quantity,
      quantity_before: before,
      quantity_after: Number(inventory.quantity),
      reason,
    });
    addAudit("dispose_batch", "batch", Number(batch.id), { quantity, reason });
    persist();
    return ok({ id: Number(batch.id) }, config);
  }

  /* ── sales ───────────────────────────────────────────────────── */
  if (method === "GET" && p === "/sales") {
    const status = qStr(q, "status");
    const dateFrom = qStr(q, "dateFrom");
    const dateTo = qStr(q, "dateTo");
    const rows = db.salesOrders
      .filter((order) => {
        if (status && order.status !== status) return false;
        if (dateFrom && dateKey(order.created_at) < dateFrom) return false;
        if (dateTo && dateKey(order.created_at) > dateTo) return false;
        return true;
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(saleSummary);
    return ok(paginate(rows, q), config);
  }

  if (method === "POST" && p === "/sales") {
    const order = createSaleOrder(asRow(payload));
    persist();
    return ok(saleDetail(order), config);
  }

  match = p.match(/^\/sales\/(\d+)\/void$/);
  if (method === "POST" && match) {
    const order = db.salesOrders.find((row) => Number(row.id) === Number(match?.[1]));
    if (!order) return fail(404, "NOT_FOUND", "销售单不存在", config);
    voidSaleOrder(order);
    persist();
    return ok(saleDetail(order), config);
  }

  match = p.match(/^\/sales\/(\d+)$/);
  if (method === "GET" && match) {
    const order = db.salesOrders.find((row) => Number(row.id) === Number(match?.[1]));
    if (!order) return fail(404, "NOT_FOUND", "销售单不存在", config);
    return ok(saleDetail(order), config);
  }

  /* ── payables ────────────────────────────────────────────────── */
  if (method === "GET" && p === "/payables") {
    return ok(payablesSummary(), config);
  }

  if (method === "POST" && p === "/payables/payments") {
    const row = asRow(payload);
    const supplier = supplierOf(row.supplierId);
    if (!supplier) return fail(400, "VALIDATION_ERROR", "请选择有效的供应商", config);
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail(400, "VALIDATION_ERROR", "付款金额必须大于 0", config);
    }
    const id = nextId("payment");
    db.payments.push({
      id,
      supplier_id: Number(supplier.id),
      invoice_id: row.invoiceId ? Number(row.invoiceId) : null,
      amount: round2(amount),
      method: row.method ? String(row.method) : null,
      paid_at: row.paidAt ? dateKey(row.paidAt) : todayKey(),
      note: row.note ? String(row.note) : null,
      created_by: currentUserId(),
      created_at: nowIso(),
    });
    addAudit("record_payment", "payment", id, {
      supplierId: supplier.id,
      amount: round2(amount),
    });
    persist();
    return ok({ id }, config);
  }

  match = p.match(/^\/payables\/(\d+)$/);
  if (method === "GET" && match) {
    const detail = payableDetail(Number(match[1]));
    if (!detail) return fail(404, "NOT_FOUND", "供应商不存在", config);
    return ok(detail, config);
  }

  /* ── notifications ───────────────────────────────────────────── */
  if (method === "GET" && p === "/notifications/unread-count") {
    const count = db.notifications.filter((item) => !item.is_read).length;
    return ok({ count }, config);
  }

  if (method === "PUT" && p === "/notifications/read-all") {
    for (const item of db.notifications) item.is_read = true;
    persist();
    return ok(null, config);
  }

  match = p.match(/^\/notifications\/(\d+)\/read$/);
  if (method === "PUT" && match) {
    const item = db.notifications.find((row) => Number(row.id) === Number(match?.[1]));
    if (!item) return fail(404, "NOT_FOUND", "通知不存在", config);
    item.is_read = true;
    persist();
    return ok(null, config);
  }

  if (method === "GET" && p === "/notifications") {
    const isRead = qBool(q, "isRead");
    const rows = db.notifications
      .filter((item) => isRead === null || Boolean(item.is_read) === isRead)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return ok(paginate(rows, q), config);
  }

  /* ── settings ────────────────────────────────────────────────── */
  if (method === "GET" && p === "/settings") {
    return ok({ ...db.settings }, config);
  }
  if (method === "PUT" && p === "/settings") {
    const row = asRow(payload);
    for (const [key, value] of Object.entries(row)) {
      db.settings[key] = String(value ?? "");
    }
    addAudit("update_settings", "setting", null, Object.keys(row));
    persist();
    return ok(null, config);
  }

  /* ── users ───────────────────────────────────────────────────── */
  if (method === "GET" && p === "/users") {
    return ok(
      db.users.map((user) => ({
        id: Number(user.id),
        username: user.username,
        display_name: user.display_name,
        email: user.email ?? null,
        role: user.role,
        is_active: Boolean(user.is_active),
        created_at: user.created_at,
        last_login_at: user.last_login_at ?? null,
      })),
      config
    );
  }

  if (method === "POST" && p === "/users") {
    const row = asRow(payload);
    const username = String(row.username ?? "").trim();
    if (!username || !String(row.password ?? "").trim()) {
      return fail(400, "VALIDATION_ERROR", "用户名和密码为必填项", config);
    }
    if (db.users.some((user) => user.username === username)) {
      return fail(400, "DUPLICATE_USERNAME", "该用户名已存在", config);
    }
    if (String(row.password).length < 6) {
      return fail(400, "VALIDATION_ERROR", "密码至少需要 6 位", config);
    }
    const id = nextRowId(db.users);
    db.users.push({
      id,
      username,
      password: String(row.password),
      display_name: String(row.displayName || username),
      email: row.email ? String(row.email) : null,
      role: row.role === "admin" ? "admin" : "staff",
      is_active: true,
      created_at: nowIso(),
      last_login_at: null,
    });
    addAudit("create_user", "user", id, { username });
    persist();
    return ok({ id }, config);
  }

  match = p.match(/^\/users\/(\d+)\/status$/);
  if (method === "PUT" && match) {
    const user = db.users.find((row) => Number(row.id) === Number(match?.[1]));
    if (!user) return fail(404, "NOT_FOUND", "用户不存在", config);
    user.is_active = Boolean(asRow(payload).isActive);
    addAudit("update_user_status", "user", Number(user.id), {
      isActive: user.is_active,
    });
    persist();
    return ok(null, config);
  }

  match = p.match(/^\/users\/(\d+)\/reset-password$/);
  if (method === "PUT" && match) {
    const user = db.users.find((row) => Number(row.id) === Number(match?.[1]));
    if (!user) return fail(404, "NOT_FOUND", "用户不存在", config);
    const password = String(asRow(payload).newPassword ?? "");
    if (password.length < 6) {
      return fail(400, "VALIDATION_ERROR", "新密码至少需要 6 位", config);
    }
    user.password = password;
    addAudit("reset_password", "user", Number(user.id));
    persist();
    return ok(null, config);
  }

  match = p.match(/^\/users\/(\d+)$/);
  if (method === "PUT" && match) {
    const user = db.users.find((row) => Number(row.id) === Number(match?.[1]));
    if (!user) return fail(404, "NOT_FOUND", "用户不存在", config);
    const row = asRow(payload);
    if ("displayName" in row) user.display_name = String(row.displayName);
    if ("email" in row) user.email = row.email ? String(row.email) : null;
    if ("role" in row && (row.role === "admin" || row.role === "staff")) {
      user.role = row.role;
    }
    addAudit("update_user", "user", Number(user.id), {
      displayName: user.display_name,
      role: user.role,
    });
    persist();
    return ok(null, config);
  }

  /* ── audit logs ──────────────────────────────────────────────── */
  if (method === "GET" && p === "/audit-logs") {
    const userId = qNum(q, "userId");
    const action = qStr(q, "action");
    const entityType = qStr(q, "entityType");
    const dateFrom = qStr(q, "dateFrom");
    const dateTo = qStr(q, "dateTo");
    const rows = db.auditLogs
      .filter((log) => {
        if (userId && Number(log.user_id) !== userId) return false;
        if (action && log.action !== action) return false;
        if (entityType && log.entity_type !== entityType) return false;
        if (dateFrom && dateKey(log.created_at) < dateFrom) return false;
        if (dateTo && dateKey(log.created_at) > dateTo) return false;
        return true;
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((log) => {
        const user = db.users.find((row) => Number(row.id) === Number(log.user_id));
        return {
          id: Number(log.id),
          user: user
            ? {
                id: Number(user.id),
                username: user.username,
                displayName: user.display_name,
              }
            : null,
          action: log.action,
          entityType: log.entity_type,
          entityId: log.entity_id ?? null,
          details: log.details ?? null,
          ipAddress: log.ip_address ?? null,
          createdAt: log.created_at,
        };
      });
    return ok(paginate(rows, q), config);
  }

  /* ── learned OCR aliases ─────────────────────────────────────── */
  if (method === "GET" && p === "/product-aliases") {
    const supplierId = qNum(q, "supplierId");
    const items = db.aliases
      .filter((alias) => !supplierId || Number(alias.supplier_id) === supplierId)
      .map((alias) => {
        const supplier = supplierOf(alias.supplier_id);
        const product = db.products.find(
          (row) => Number(row.id) === Number(alias.product_id)
        );
        return {
          id: Number(alias.id),
          supplierId: Number(alias.supplier_id),
          supplierName: supplier?.name ?? "未知供应商",
          aliasType: alias.alias_type,
          aliasKey: alias.alias_key,
          productId: Number(alias.product_id),
          productName: product
            ? `${product.name_en}${product.name_zh ? ` (${product.name_zh})` : ""}`
            : `商品 #${alias.product_id}`,
          hits: Number(alias.hits),
          updatedAt: alias.updated_at,
        };
      })
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return ok({ items }, config);
  }

  match = p.match(/^\/product-aliases\/(\d+)$/);
  if (method === "DELETE" && match) {
    const aliasId = Number(match[1]);
    const before = db.aliases.length;
    db.aliases = db.aliases.filter((alias) => Number(alias.id) !== aliasId);
    if (db.aliases.length === before) {
      return fail(404, "NOT_FOUND", "该匹配记录不存在", config);
    }
    persist();
    return ok(null, config);
  }

  /* ── AI providers ────────────────────────────────────────────── */
  if (method === "GET" && p === "/ai-providers") {
    return ok(db.aiProviders, config);
  }

  if (method === "POST" && p === "/ai-providers") {
    const row = asRow(payload);
    const id = nextRowId(db.aiProviders);
    db.aiProviders.push({
      id,
      name: String(row.name ?? `AI 提供商 ${id}`),
      baseUrl: String(row.baseUrl ?? ""),
      apiKeyMasked: maskKey(String(row.apiKey ?? "")),
      model: String(row.model ?? ""),
      thinkingEffort: row.thinkingEffort ?? null,
      supportsVision: Boolean(row.supportsVision),
      purpose: row.purpose ?? "all",
      isActive: row.isActive !== false,
      isDefault: db.aiProviders.length === 0,
      maxTokens: Number(row.maxTokens ?? 32768),
      temperature: Number(row.temperature ?? 0.3),
      lastTestAt: null,
      lastTestSuccess: null,
      lastTestLatencyMs: null,
      notes: row.notes ?? null,
      createdAt: nowIso(),
    });
    persist();
    return ok({ id }, config);
  }

  match = p.match(/^\/ai-providers\/(\d+)\/set-default$/);
  if (method === "PUT" && match) {
    const id = Number(match[1]);
    const provider = db.aiProviders.find((row) => Number(row.id) === id);
    if (!provider) return fail(404, "NOT_FOUND", "AI 提供商不存在", config);
    for (const row of db.aiProviders) row.isDefault = Number(row.id) === id;
    provider.isActive = true;
    persist();
    return ok(null, config);
  }

  match = p.match(/^\/ai-providers\/(\d+)\/test$/);
  if (method === "POST" && match) {
    const provider = db.aiProviders.find((row) => Number(row.id) === Number(match?.[1]));
    if (!provider) return fail(404, "NOT_FOUND", "AI 提供商不存在", config);
    await wait(650);
    const latencyMs = 120 + (hashText(String(provider.name)) % 180);
    provider.lastTestAt = nowIso();
    provider.lastTestSuccess = true;
    provider.lastTestLatencyMs = latencyMs;
    persist();
    return ok(
      {
        success: true,
        message: "连接成功（演示环境模拟响应）",
        latencyMs,
        modelResponse: `pong from ${provider.model}`,
      },
      config
    );
  }

  match = p.match(/^\/ai-providers\/(\d+)$/);
  if (match) {
    const provider = db.aiProviders.find((row) => Number(row.id) === Number(match?.[1]));
    if (!provider) return fail(404, "NOT_FOUND", "AI 提供商不存在", config);
    if (method === "PUT") {
      const row = asRow(payload);
      if ("name" in row) provider.name = String(row.name);
      if ("baseUrl" in row) provider.baseUrl = String(row.baseUrl);
      if (row.apiKey) provider.apiKeyMasked = maskKey(String(row.apiKey));
      if ("model" in row) provider.model = String(row.model);
      if ("thinkingEffort" in row) provider.thinkingEffort = row.thinkingEffort ?? null;
      if ("supportsVision" in row) provider.supportsVision = Boolean(row.supportsVision);
      if ("purpose" in row) provider.purpose = row.purpose;
      if ("isActive" in row) provider.isActive = Boolean(row.isActive);
      if ("maxTokens" in row) provider.maxTokens = Number(row.maxTokens);
      if ("temperature" in row) provider.temperature = Number(row.temperature);
      if ("notes" in row) provider.notes = row.notes ?? null;
      persist();
      return ok(null, config);
    }
    if (method === "DELETE") {
      db.aiProviders = db.aiProviders.filter(
        (row) => Number(row.id) !== Number(provider.id)
      );
      if (provider.isDefault && db.aiProviders.length > 0) {
        db.aiProviders[0].isDefault = true;
      }
      persist();
      return ok(null, config);
    }
  }

  /* ── AI assistant ────────────────────────────────────────────── */
  if (method === "POST" && p === "/ai/chat") {
    const row = asRow(payload);
    const message = String(row.message ?? "");
    await wait(750);
    return ok(
      {
        conversationId: String(row.conversationId || `demo-conv-${Date.now()}`),
        reply: buildChatReply(message),
        dataUsed: {
          tables: ["invoices", "invoice_items", "inventory", "sales_orders", "batches"],
          dateRange: "近 30 天",
          recordCount: db.invoices.length + db.inventory.length + db.salesOrders.length,
        },
      },
      config
    );
  }

  if (method === "GET" && p === "/ai/insights") {
    await wait(600);
    return ok(aiInsightsData(qStr(q, "period") || "week"), config);
  }

  if (method === "POST" && p === "/ai/reorder-advice") {
    await wait(700);
    return ok(aiReorderAdviceData(), config);
  }

  /* ── analytics ───────────────────────────────────────────────── */
  if (method === "GET" && p === "/analytics/dashboard") {
    return ok(dashboardData(), config);
  }
  if (method === "GET" && p === "/analytics/purchase-trend") {
    return ok(purchaseTrend(q), config);
  }
  if (method === "GET" && p === "/analytics/sales-trend") {
    return ok(salesTrend(q), config);
  }
  if (method === "GET" && p === "/analytics/product-ranking") {
    return ok(rankingRows(q), config);
  }
  if (method === "GET" && p === "/analytics/price-changes") {
    return ok(priceChangeRows(q), config);
  }
  if (method === "GET" && p === "/analytics/supplier-distribution") {
    return ok(supplierDistribution(q), config);
  }
  if (method === "GET" && p === "/analytics/category-distribution") {
    return ok(categoryDistribution(q), config);
  }
  if (method === "GET" && p === "/analytics/reorder-suggestions") {
    return ok(reorderRows(), config);
  }
  if (method === "GET" && p === "/analytics/profit") {
    return ok(profitData(q), config);
  }
  if (method === "GET" && p === "/analytics/slow-movers") {
    return ok(slowMoverData(q), config);
  }
  if (method === "GET" && p === "/analytics/alerts") {
    return ok(alertsData(), config);
  }
  if (method === "GET" && p === "/analytics/profit-by-category") {
    return ok(profitByCategoryData(q), config);
  }
  if (method === "GET" && p === "/analytics/search") {
    return ok(searchData(qStr(q, "q")), config);
  }

  /* ── exports ─────────────────────────────────────────────────── */
  if (method === "GET" && p === "/export/invoices") {
    const dateFrom = qStr(q, "dateFrom");
    const dateTo = qStr(q, "dateTo");
    const status = qStr(q, "status");
    const rows = db.invoices.filter((invoice) => {
      if (status && invoice.status !== status) return false;
      if (dateFrom && dateKey(invoice.invoice_date) < dateFrom) return false;
      if (dateTo && dateKey(invoice.invoice_date) > dateTo) return false;
      return true;
    });
    const csv = toCsv(
      ["发票号", "供应商", "开票日期", "未税金额", "税额", "价税合计", "状态"],
      rows.map((invoice) => [
        invoice.invoice_number,
        invoice.supplier_name ?? "",
        dateKey(invoice.invoice_date),
        invoice.subtotal,
        invoice.tax_amount,
        invoice.grand_total,
        invoice.status,
      ])
    );
    return raw(new Blob([csv], { type: "text/csv;charset=utf-8" }), config);
  }

  if (method === "GET" && p === "/export/inventory") {
    const rows = db.inventory.map(inventoryView);
    const csv = toCsv(
      ["SKU", "商品", "中文名", "数量", "单位", "安全库存", "低库存"],
      rows.map((row) => [
        row.product.sku,
        row.product.nameEn,
        row.product.nameZh,
        row.quantity,
        row.unit,
        row.safeStock,
        row.isLowStock ? "是" : "否",
      ])
    );
    return raw(new Blob([csv], { type: "text/csv;charset=utf-8" }), config);
  }

  if (method === "GET" && p === "/export/suppliers") {
    const csv = toCsv(
      ["编号", "名称", "联系人", "电话", "邮箱", "地址"],
      db.suppliers.map((supplier) => [
        supplier.code,
        supplier.name,
        supplier.contact_name,
        supplier.phone,
        supplier.email,
        supplier.address,
      ])
    );
    return raw(new Blob([csv], { type: "text/csv;charset=utf-8" }), config);
  }

  if (method === "GET" && p === "/export/purchases") {
    const dateFrom = qStr(q, "dateFrom");
    const dateTo = qStr(q, "dateTo");
    const supplierId = qNum(q, "supplierId");
    const invoiceMap = new Map(db.invoices.map((invoice) => [Number(invoice.id), invoice]));
    const rows: string[][] = [];
    for (const item of db.invoiceItems) {
      const invoice = invoiceMap.get(Number(item.invoice_id));
      if (!invoice || invoice.status !== "confirmed") continue;
      if (supplierId && Number(invoice.supplier_id) !== supplierId) continue;
      if (dateFrom && dateKey(invoice.invoice_date) < dateFrom) continue;
      if (dateTo && dateKey(invoice.invoice_date) > dateTo) continue;
      rows.push([
        invoice.invoice_number,
        dateKey(invoice.invoice_date),
        invoice.supplier_name ?? "",
        item.raw_name_en,
        String(item.quantity),
        item.unit,
        String(item.unit_price),
        String(item.line_total),
      ]);
    }
    const csv = toCsv(
      ["发票号", "开票日期", "供应商", "商品", "数量", "单位", "单价", "金额"],
      rows
    );
    return raw(new Blob([csv], { type: "text/csv;charset=utf-8" }), config);
  }

  if (method === "GET" && p === "/export/reorder-suggestions") {
    const csv = toCsv(
      ["SKU", "商品", "当前库存", "安全库存", "建议补货", "紧急程度"],
      reorderRows().map((row) => [
        row.sku,
        `${row.nameEn}${row.nameZh ? ` (${row.nameZh})` : ""}`,
        row.currentStock,
        row.safeStock,
        row.suggestedQty,
        row.urgency,
      ])
    );
    return raw(new Blob([csv], { type: "text/csv;charset=utf-8" }), config);
  }

  if (method === "GET" && p === "/export/full-backup") {
    const backup = {
      exportedAt: nowIso(),
      generatedOn: db.generatedOn,
      users: db.users.map((user) => ({
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
      })),
      categories: db.categories,
      suppliers: db.suppliers,
      products: db.products,
      inventory: db.inventory,
      invoices: db.invoices,
      invoiceItems: db.invoiceItems,
      inventoryLogs: db.inventoryLogs,
      batches: db.batches,
      salesOrders: db.salesOrders,
      salesItems: db.salesItems,
      payments: db.payments,
      aliases: db.aliases,
      notifications: db.notifications,
      auditLogs: db.auditLogs,
      settings: db.settings,
    };
    return raw(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      config
    );
  }

  return fail(404, "NOT_FOUND", `演示环境未实现该接口：${method} ${p}`, config);
}

/* ── AI replies ────────────────────────────────────────────────── */

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function maskKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "sk-••••••••";
  return `${trimmed.slice(0, 3)}${"•".repeat(8)}${trimmed.slice(-4)}`;
}

function buildChatReply(message: string): string {
  const text = message.toLowerCase();
  const overview = dashboardData();

  if (/库存|补货|缺货|stock/.test(text)) {
    const rows = reorderRows().slice(0, 5);
    if (rows.length === 0) {
      return "目前所有商品都高于安全库存，暂时不需要补货。可以继续关注临期批次，优先售出即将到期的商品。";
    }
    return `根据当前库存与安全库存，以下商品需要优先补货：\n${rows
      .map(
        (row, index) =>
          `${index + 1}. ${row.nameZh || row.nameEn}：现有 ${row.currentStock} ${row.unit}，安全库存 ${row.safeStock}，建议进货 ${row.suggestedQty} ${row.unit}${row.urgency === "high" ? "（紧急）" : ""}。`
      )
      .join("\n")}\n\n建议先联系默认供应商确认到货周期，再安排下一次收货。`;
  }

  if (/价格|涨价|降价|price|pricing/.test(text)) {
    const rows = priceChangeRows({
      threshold: 5,
      dateFrom: keyShift(-30),
      dateTo: todayKey(),
      limit: 5,
    });
    if (rows.length === 0) {
      return "近 30 天没有检测到超过 5% 的采购价波动，价格整体平稳。";
    }
    return `近 30 天价格波动较大的商品：\n${rows
      .map(
        (row, index) =>
          `${index + 1}. ${row.nameZh || row.nameEn}：${row.previousPrice.toFixed(2)} → ${row.currentPrice.toFixed(2)}（${row.changePercent > 0 ? "+" : ""}${row.changePercent}%）`
      )
      .join("\n")}\n\n对涨价商品建议核对供应商报价，必要时比较替代货源。`;
  }

  if (/毛利|利润|profit|margin/.test(text)) {
    const profit = profitData({ dateFrom: keyShift(-30), dateTo: todayKey() });
    return `近 30 天销售毛利概览：\n- 销售额：${formatMoney(profit.revenue)}\n- 销售成本：${formatMoney(profit.cost)}\n- 毛利：${formatMoney(profit.grossProfit)}\n- 毛利率：${(profit.margin * 100).toFixed(1)}%\n- 完成订单：${profit.orderCount} 单\n\n毛利贡献最高的商品是 ${profit.topProducts[0]?.nameZh || profit.topProducts[0]?.nameEn || "暂无数据"}。建议保持高毛利商品的库存，同时关注滞销商品的促销。`;
  }

  if (/销售|营业额|sales|收入/.test(text)) {
    const trend = salesTrend({ period: "day" }).slice(-7);
    const total = sumBy(trend, (row) => Number(row.amount));
    const orders = sumBy(trend, (row) => Number(row.orderCount));
    return `近 7 天销售：${orders} 单，合计 ${formatMoney(total)}。\n${trend
      .map((row) => `- ${row.date}：${formatMoney(Number(row.amount))}，${row.orderCount} 单`)
      .join("\n")}\n\n周末客流通常更高，可以提前准备畅销品库存。`;
  }

  if (/供应商|supplier/.test(text)) {
    const rows = supplierDistribution({
      dateFrom: keyShift(-90),
      dateTo: todayKey(),
    }).slice(0, 5);
    if (rows.length === 0) return "近 90 天没有采购记录。";
    return `近 90 天采购金额最高的供应商：\n${rows
      .map(
        (row, index) =>
          `${index + 1}. ${row.supplierName}：${formatMoney(row.totalAmount)}（${row.percentage}%，${row.invoiceCount} 张发票）`
      )
      .join("\n")}\n\n建议与占比最高的供应商确认账期和价格条款。`;
  }

  if (/发票|invoice|审核/.test(text)) {
    const pending = db.invoices.filter((invoice) => invoice.status === "pending").length;
    return `当前有 ${pending} 张发票待审核；本月已确认 ${overview.thisMonth.invoiceCount} 张，采购金额 ${formatMoney(overview.thisMonth.totalAmount)}。\n待审核发票确认后才会更新库存和应付账款，建议优先处理金额较大的单据。`;
  }

  return `当前经营概览：\n- 今日采购：${overview.today.invoiceCount} 张发票，${formatMoney(overview.today.totalAmount)}\n- 本周采购：${formatMoney(overview.thisWeek.totalAmount)}\n- 本月采购：${formatMoney(overview.thisMonth.totalAmount)}\n- 待审核发票：${overview.today.pendingInvoices} 张\n- 低库存商品：${overview.today.lowStockAlerts} 个\n- 临期/过期批次：${overview.expiringBatches.length} 个\n\n你可以问我「哪些商品需要补货」「最近哪些商品涨价最多」「这个月毛利如何」。`;
}

function aiInsightsData(period: string) {
  const days = period === "month" ? 30 : 7;
  const from = keyShift(-days);
  const to = todayKey();
  const invoices = db.invoices.filter(
    (invoice) => invoice.status === "confirmed" && inRange(invoice.invoice_date, from, to)
  );
  const sales = db.salesOrders.filter(
    (order) => order.status === "completed" && inRange(order.created_at, from, to)
  );
  const purchaseTotal = sumBy(invoices, (invoice) => Number(invoice.grand_total));
  const salesTotal = sumBy(sales, (order) => Number(order.total));
  const lowCount = lowStockRows().length;
  const expiringCount = expiringBatchRows(7).length;
  const pendingCount = db.invoices.filter((invoice) => invoice.status === "pending").length;
  const alerts: Array<{ type: string; message: string }> = [];

  if (lowCount > 0) {
    alerts.push({
      type: "库存",
      message: `${lowCount} 个商品低于安全库存，建议优先补货。`,
    });
  }
  if (expiringCount > 0) {
    alerts.push({
      type: "保质期",
      message: `未来 7 天内有 ${expiringCount} 个批次临期或已过期，请安排促销或报损。`,
    });
  }
  if (pendingCount > 0) {
    alerts.push({
      type: "发票",
      message: `${pendingCount} 张发票仍待审核，确认后库存与应付账款才会更新。`,
    });
  }

  return {
    period,
    summary: `近 ${days} 天采购 ${invoices.length} 张发票，金额 ${formatMoney(purchaseTotal)}；完成销售 ${sales.length} 单，金额 ${formatMoney(salesTotal)}。${lowCount > 0 ? `当前 ${lowCount} 个商品低于安全库存，` : ""}${expiringCount > 0 ? `${expiringCount} 个批次临期。` : "库存与批次状态整体稳定。"}`,
    alerts,
    generatedAt: nowIso(),
  };
}

function aiReorderAdviceData() {
  const rows = reorderRows().slice(0, 6);
  return {
    advice:
      rows.length === 0
        ? "当前没有低于安全库存的商品，建议维持现有订货节奏。"
        : `结合近 30 天销量与安全库存，建议本次优先补货 ${rows.length} 个商品，其中紧急商品 ${rows.filter((row) => row.urgency === "high").length} 个。下单前可核对供应商账期与在途数量，避免重复进货。`,
    suggestedItems: rows.map((row) => ({
      productId: row.productId,
      nameZh: row.nameZh ?? row.nameEn,
      suggestedQty: row.suggestedQty,
      normalQty: row.safeStock,
      reason: `现有 ${row.currentStock}，安全库存 ${row.safeStock}，${row.urgency === "high" ? "存在缺货风险" : "接近安全线"}`,
    })),
  };
}

/* ── CSV ───────────────────────────────────────────────────────── */

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n")}`;
}

/* ── adapter ───────────────────────────────────────────────────── */

export function createDemoAdapter(): AxiosAdapter {
  return async (config) => {
    const method = String(config.method ?? "get").toUpperCase();
    const base = String(config.baseURL ?? "").replace(/\/+$/, "");
    const rawUrl = String(config.url ?? "");
    const fullUrl = /^https?:\/\//.test(rawUrl)
      ? rawUrl
      : `${base}/${rawUrl.replace(/^\/+/, "")}`;
    const withoutOrigin = fullUrl.replace(/^https?:\/\/[^/]+/, "");
    const [rawPath, rawQuery] = withoutOrigin.split("?");
    const pathname = rawPath.replace(/^\/api\/v1/, "") || "/";
    const query: Query = {};

    if (rawQuery) {
      new URLSearchParams(rawQuery).forEach((value, key) => {
        query[key] = value;
      });
    }
    if (config.params && typeof config.params === "object") {
      for (const [key, value] of Object.entries(config.params as Query)) {
        if (value !== undefined && value !== null) query[key] = value;
      }
    }

    let payload: unknown = config.data;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        /* keep the raw string */
      }
    }

    const isUpload = method === "POST" && pathname === "/invoices/upload";
    if (!isUpload) {
      await wait(80 + Math.floor(Math.random() * 120));
    }

    try {
      return await handleRequest(method, pathname, query, payload, config);
    } catch (error) {
      if (error instanceof DemoError) {
        return fail(error.status, error.code, error.message, config);
      }
      throw error;
    }
  };
}

