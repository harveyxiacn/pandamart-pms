import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, FileSearch, FileText, SearchX } from "lucide-react";
import { confirmInvoice, deleteInvoice, getInvoiceById, getInvoices, rollbackInvoiceConfirm, updateInvoice } from "../api/invoices";
import { getAllSuppliers } from "../api/suppliers";
import type { InvoiceDetail, InvoiceSummary, Supplier } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Table, Td, Th } from "../components/ui/Table";
import { Input, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { SearchInput } from "../components/ui/SearchInput";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
import { Toolbar, ToolbarGroup } from "../components/ui/Toolbar";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { DateRangePicker } from "../components/ui/DatePicker";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Pagination } from "../components/ui/Pagination";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { formatCurrency, formatDate } from "../utils/formatters";
import { useDebounce } from "../hooks/useDebounce";
import { useAuth } from "../hooks/useAuth";
import type { DateRange } from "../utils/date";

type EditableItem = {
  id: number;
  productId: number | null;
  productNameZh: string;
  productNameEn: string;
  productCode: string;
  productNumber: string;
  un: string;
  taxCode: "E" | "H";
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

type EditableInvoice = {
  supplierId: number | null;
  invoiceNumber: string;
  invoiceDate: string;
  customerCode: string;
  notes: string;
  hasTax: boolean;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  items: EditableItem[];
};

function parseOcrRawResult(raw: InvoiceDetail["ocrRawResult"]) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return null;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isClose(a: number | null, b: number | null, tolerance = 0.02): boolean {
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tolerance;
}

function toEditableInvoice(detail: InvoiceDetail): EditableInvoice {
  const subtotal = detail.subtotal ?? detail.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxAmount = detail.taxAmount ?? 0;
  const grandTotal = detail.grandTotal;

  return {
    supplierId: detail.supplier?.id ?? null,
    invoiceNumber: detail.invoiceNumber,
    invoiceDate: detail.invoiceDate?.slice(0, 10),
    customerCode: detail.customerCode || "",
    notes: detail.notes || "",
    hasTax: detail.hasTax,
    subtotal,
    taxAmount,
    grandTotal,
    items: detail.items.map((line) => ({
      id: line.id,
      productId: line.product?.id ?? null,
      productNameZh: line.rawNameZh || line.product?.nameZh || "",
      productNameEn: line.rawNameEn || line.product?.nameEn || "",
      productCode: line.rawProductCode || "",
      productNumber: line.rawProductNumber || "",
      un: line.rawUn || line.unit || "",
      taxCode: line.rawTaxCode === "E" ? "E" : "H",
      quantity: Number(line.quantity) || 0,
      unit: line.unit || line.rawUn || "EA",
      unitPrice: Number(line.unitPrice) || 0,
      lineTotal: Number(line.lineTotal) || 0,
    })),
  };
}

function normalizeSupplierName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\uFF08\uFF09]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

function guessSupplierByOcrName(ocrSupplierName: string, suppliers: Supplier[]): Supplier | null {
  const raw = ocrSupplierName.trim();
  if (!raw) return null;

  const pieces = raw
    .split(/[/|]/)
    .flatMap((part) => part.split(/[()]/))
    .map((part) => part.trim())
    .filter(Boolean);

  const normalizedTokens = Array.from(new Set([raw, ...pieces].map((token) => normalizeSupplierName(token)).filter(Boolean)));
  if (normalizedTokens.length === 0) return null;

  for (const supplier of suppliers) {
    const normalizedSupplier = normalizeSupplierName([supplier.name, supplier.code].filter(Boolean).join(" "));
    if (!normalizedSupplier) continue;
    if (normalizedTokens.some((token) => normalizedSupplier.includes(token) || token.includes(normalizedSupplier))) {
      return supplier;
    }
  }
  return null;
}

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<InvoiceSummary[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [status, setStatus] = useState(isAdmin ? "" : "pending");
  const [keyword, setKeyword] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  // 服务端 pageSize 上限 100：改为真实分页，避免超过 100 张发票后旧记录不可见
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableInvoice | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // 记录已通过深链打开的发票 id，避免重复触发
  const openedDeepLinkRef = useRef<number | null>(null);

  const debouncedKeyword = useDebounce(keyword, 400);

  const load = async (targetPage = page, kw: string = keyword, targetPageSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const statusFilter = isAdmin ? status || undefined : "pending";
      const data = await getInvoices({
        page: targetPage,
        pageSize: targetPageSize,
        status: statusFilter,
        keyword: kw || undefined,
        supplierId: supplierId || undefined,
        dateFrom: dateRange.start || undefined,
        dateTo: dateRange.end || undefined,
      });
      setItems(data.items);
      setTotal(data.pagination.total);
      setPage(data.pagination.page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 用防抖后的关键字触发搜索并回到第 1 页；手动「回车」仍走 load(1) 使用即时关键字
    void load(1, debouncedKeyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, status, supplierId, dateRange.start, dateRange.end]);

  useEffect(() => {
    // 跨页拉取全部供应商（服务端 pageSize 上限 100），避免筛选下拉漏项
    getAllSuppliers()
      .then((items) => setSuppliers(items))
      .catch(() => setSuppliers([]));
  }, []);

  // 深链支持：/invoices?id=123（来自 Header 搜索结果与 Dashboard 近期发票卡片）
  // 列表加载完成后自动打开对应发票详情，每个 id 仅触发一次
  useEffect(() => {
    if (loading) return;
    const idParam = searchParams.get("id");
    if (!idParam) return;
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) return;
    if (openedDeepLinkRef.current === id) return;
    openedDeepLinkRef.current = id;
    void openDetail(id);
    // 打开后清除 URL 中的 ?id=，避免刷新或返回时重复打开
    const next = new URLSearchParams(searchParams);
    next.delete("id");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  const openDetail = async (invoiceId: number) => {
    setActionMessage(null);
    setActionError(null);
    setEditing(false);
    setDraft(null);
    setDetailLoading(true);
    try {
      const res = await getInvoiceById(invoiceId);
      setDetail(res);
      setDraft(toEditableInvoice(res));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "加载发票详情失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setEditing(false);
    setDraft(null);
    setActionMessage(null);
    setActionError(null);
  };

  const activeDraft = useMemo(() => {
    if (draft) return draft;
    if (detail) return toEditableInvoice(detail);
    return null;
  }, [draft, detail]);

  const ocr = useMemo(() => parseOcrRawResult(detail?.ocrRawResult || null), [detail]);

  const ocrSupplierNameRaw =
    (typeof ocr?.supplierName === "string" && ocr.supplierName) ||
    (typeof ocr?.supplier_name === "string" && ocr.supplier_name) ||
    "";

  const ocrSupplierName = ocrSupplierNameRaw || "-";

  const suggestedSupplier = useMemo(() => {
    if (!ocrSupplierNameRaw) return null;
    return guessSupplierByOcrName(ocrSupplierNameRaw, suppliers);
  }, [ocrSupplierNameRaw, suppliers]);

  useEffect(() => {
    if (!detail || detail.status !== "pending") return;
    if (!draft || draft.supplierId || !suggestedSupplier) return;
    setDraft((prev) => (prev && !prev.supplierId ? { ...prev, supplierId: suggestedSupplier.id } : prev));
  }, [detail, draft, suggestedSupplier]);

  const syncDraftTotals = (next: EditableInvoice): EditableInvoice => {
    const subtotal = Number(next.items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
    const taxAmount = Number(next.taxAmount || 0);
    return {
      ...next,
      subtotal,
      hasTax: taxAmount > 0,
      grandTotal: Number((subtotal + taxAmount).toFixed(2)),
    };
  };

  const updateDraftItem = (index: number, patch: Partial<EditableItem>) => {
    if (!draft) return;
    const nextItems = draft.items.map((item, i) => {
      if (i !== index) return item;
      const merged = { ...item, ...patch };
      if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
        merged.lineTotal = Number((Number(merged.quantity) * Number(merged.unitPrice)).toFixed(2));
      }
      return merged;
    });
    setDraft(syncDraftTotals({ ...draft, items: nextItems }));
  };

  const recalculateDraftTotals = () => {
    if (!draft) return;
    const subtotal = Number(draft.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0).toFixed(2));
    const taxableSubtotal = Number(
      draft.items
        .filter((item) => item.taxCode === "H")
        .reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)
        .toFixed(2)
    );

    const currentTax = Number(draft.taxAmount || 0);
    const inferredRate = taxableSubtotal > 0 && currentTax > 0 ? currentTax / taxableSubtotal : 0;
    const taxRate = inferredRate > 0 ? inferredRate : taxableSubtotal > 0 ? 0.13 : 0;
    const taxAmount = Number((taxableSubtotal * taxRate).toFixed(2));
    const grandTotal = Number((subtotal + taxAmount).toFixed(2));

    setDraft({
      ...draft,
      subtotal,
      hasTax: taxAmount > 0,
      taxAmount,
      grandTotal,
    });
    setActionError(null);
    setActionMessage(`已重新计算：Sales ${formatCurrency(subtotal)}，Tax ${formatCurrency(taxAmount)}，Total ${formatCurrency(grandTotal)}`);
  };

  const handleSaveUpdate = async () => {
    if (!detail || !draft) return;
    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const payload = {
        supplierId: draft.supplierId,
        invoiceNumber: draft.invoiceNumber.trim(),
        invoiceDate: draft.invoiceDate,
        customerCode: draft.customerCode || null,
        notes: draft.notes,
        hasTax: draft.hasTax,
        subtotal: draft.subtotal,
        taxAmount: draft.taxAmount,
        grandTotal: draft.grandTotal,
        items: draft.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productNameEn: item.productNameEn,
          productNameZh: item.productNameZh || null,
          productCode: item.productCode || null,
          productNumber: item.productNumber || null,
          un: item.un || null,
          taxCode: item.taxCode,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          lineTotal: Number(item.lineTotal),
        })),
      };

      const updated = await updateInvoice(detail.id, payload);
      setDetail(updated);
      setEditing(false);
      setDraft(toEditableInvoice(updated));
      setActionMessage("发票修改已保存");
      toast.success("发票修改已保存");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "发票修改失败";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!detail || !activeDraft) return;
    if (!activeDraft.supplierId) {
      setEditing(true);
      setActionError("请先选择供应商后再确认入库（已切换到编辑模式）");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const payload = {
        supplierId: activeDraft.supplierId,
        invoiceNumber: activeDraft.invoiceNumber,
        invoiceDate: activeDraft.invoiceDate,
        customerCode: activeDraft.customerCode || null,
        notes: activeDraft.notes,
        subtotal: activeDraft.subtotal,
        hasTax: activeDraft.hasTax,
        taxAmount: activeDraft.taxAmount,
        grandTotal: activeDraft.grandTotal,
        items: activeDraft.items.map((item) => ({
          productId: item.productId,
          productNameEn: item.productNameEn,
          productNameZh: item.productNameZh || null,
          productCode: item.productCode || null,
          productNumber: item.productNumber || null,
          un: item.un || null,
          taxCode: item.taxCode,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          lineTotal: Number(item.lineTotal),
          isNewProduct: !item.productId,
        })),
      };

      await confirmInvoice(detail.id, payload);
      const refreshed = await getInvoiceById(detail.id);
      setDetail(refreshed);
      setEditing(false);
      setDraft(toEditableInvoice(refreshed));
      setActionMessage("发票已确认入库");
      toast.success("发票已确认入库");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "确认入库失败";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    const ok = await confirm({
      title: "删除发票",
      message: `确认删除发票 ${detail.invoiceNumber} 吗？此操作不可撤销。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;

    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await deleteInvoice(detail.id);
      closeDetail();
      toast.success("发票已删除");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除发票失败";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollbackConfirm = async () => {
    if (!detail) return;
    const ok = await confirm({
      title: "回滚发票",
      message: `确认将发票 ${detail.invoiceNumber} 回滚为待处理吗？`,
      confirmText: "回滚",
    });
    if (!ok) return;

    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const updated = await rollbackInvoiceConfirm(detail.id, "管理员回滚未确认");
      setDetail(updated);
      setEditing(false);
      setDraft(toEditableInvoice(updated));
      setActionMessage("已回滚为待处理，可再次修改或确认");
      toast.success("已回滚为待处理");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "回滚失败";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const source = activeDraft;
  const ocrSalesTotal = numberFromUnknown(ocr?.salesTotal ?? ocr?.subtotal);
  const ocrTaxTotal = numberFromUnknown(ocr?.taxTotal ?? ocr?.taxAmount);
  const ocrTotal = numberFromUnknown(ocr?.total ?? ocr?.grandTotal);
  const isPending = detail?.status === "pending";
  const canEditFields = Boolean(isPending && editing);
  const quantityTotal = source ? Number(source.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0).toFixed(2)) : 0;
  const kindCount = source
    ? new Set(source.items.map((item) => item.productCode || item.productNumber || item.productNameEn || item.productNameZh).filter(Boolean)).size
    : 0;

  const hasFilters = Boolean(keyword || supplierId || dateRange.start || dateRange.end || (isAdmin && status));
  const clearFilters = () => {
    setKeyword("");
    setSupplierId("");
    setDateRange({ start: null, end: null });
    if (isAdmin) setStatus("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="发票列表"
        description="查看、校对并确认供应商发票；确认后自动入库并更新批次。"
        actions={
          <Button leadingIcon={FileSearch} onClick={() => navigate("/invoices/scan")}>
            识别新发票
          </Button>
        }
      />

      <Card>
        <Toolbar>
          <ToolbarGroup grow>
            <SearchInput
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onClear={() => setKeyword("")}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(1);
              }}
              placeholder="搜索发票号"
              aria-label="搜索发票号"
              containerClassName="w-full sm:max-w-[15rem]"
            />
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              label="按开票日期筛选"
              className="w-auto min-w-[13rem]"
            />
            {isAdmin ? (
              <Select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                aria-label="按供应商筛选"
                className="w-auto min-w-[9rem]"
              >
                <option value="">全部供应商</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            ) : null}
            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                清除筛选
              </Button>
            ) : null}
          </ToolbarGroup>
          <ToolbarGroup>
            {isAdmin ? (
              <SegmentedControl
                label="按状态筛选"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "", label: "全部" },
                  { value: "pending", label: "待处理" },
                  { value: "confirmed", label: "已确认" },
                  { value: "rejected", label: "已驳回" },
                ]}
              />
            ) : (
              <Badge tone="warning">当前范围：待处理发票</Badge>
            )}
          </ToolbarGroup>
        </Toolbar>
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-title font-semibold tracking-tight text-ink">发票记录</h2>
          <span className="text-meta text-ink-subtle">
            共 <span className="font-medium tabular text-ink-muted">{total}</span> 张
          </span>
        </div>
        {loading ? <SkeletonTable rows={6} columns={6} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={FileText}
            title="加载失败"
            description={error}
            action={
              <Button variant="ghost" onClick={() => void load()}>
                重试
              </Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState
            icon={hasFilters ? SearchX : FileText}
            title={hasFilters ? "没有符合条件的发票" : "暂无发票"}
            description={
              hasFilters
                ? "试试放宽日期范围或清除筛选条件。"
                : "前往「发票识别」上传第一张供应商发票。"
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  清除筛选
                </Button>
              ) : (
                <Button leadingIcon={FileSearch} onClick={() => navigate("/invoices/scan")}>
                  去识别发票
                </Button>
              )
            }
          />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>发票号</Th>
                  <Th>供应商</Th>
                  <Th>开票日期</Th>
                  <Th numeric>总额</Th>
                  <Th>状态</Th>
                  <Th className="cell-actions">操作</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <Td>
                      <button
                        type="button"
                        onClick={() => void openDetail(item.id)}
                        className="cell-strong text-left underline-offset-4 hover:text-accent hover:underline"
                      >
                        {item.invoiceNumber}
                      </button>
                    </Td>
                    <Td>{item.supplierName || <span className="text-ink-subtle">未匹配供应商</span>}</Td>
                    <Td className="whitespace-nowrap tabular">{formatDate(item.invoiceDate)}</Td>
                    <Td numeric className="font-medium text-ink">
                      {formatCurrency(item.grandTotal)}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          item.status === "confirmed"
                            ? "success"
                            : item.status === "rejected"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {item.status === "confirmed" ? "已确认" : item.status === "rejected" ? "已驳回" : "待处理"}
                      </Badge>
                    </Td>
                    <Td className="cell-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void openDetail(item.id)}
                        trailingIcon={ChevronRight}
                        aria-label={`查看发票 ${item.invoiceNumber}`}
                      >
                        查看
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-3">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={(next) => void load(next)}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  void load(1, keyword, size);
                }}
              />
            </div>
          </>
        ) : null}
      </Card>

      <Modal
        open={detail !== null || detailLoading}
        title={detail ? `发票 ${detail.invoiceNumber}` : editing ? "发票编辑" : "发票详情"}
        description={
          detail
            ? `${detail.supplier?.name || "未匹配供应商"} · ${formatDate(detail.invoiceDate)}`
            : undefined
        }
        size="full"
        onClose={closeDetail}
      >
        {detailLoading ? (
          <SkeletonTable rows={6} columns={4} />
        ) : detail && source ? (
          <div className="space-y-4 text-sm">
            {actionMessage ? <p className="rounded-lg border border-success/20 bg-success-soft px-3 py-2 text-success">{actionMessage}</p> : null}
            {actionError ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger">{actionError}</p> : null}

            <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-4">
              <label>
                发票号
                <Input
                  value={source.invoiceNumber}
                  disabled={!canEditFields}
                  onChange={(e) => canEditFields && setDraft((prev) => (prev ? { ...prev, invoiceNumber: e.target.value } : prev))}
                />
              </label>
              <label>
                发票日期
                <Input
                  type="date"
                  value={source.invoiceDate}
                  disabled={!canEditFields}
                  onChange={(e) => canEditFields && setDraft((prev) => (prev ? { ...prev, invoiceDate: e.target.value } : prev))}
                />
              </label>
              <label>
                客户编码
                <Input
                  value={source.customerCode}
                  disabled={!canEditFields}
                  onChange={(e) => canEditFields && setDraft((prev) => (prev ? { ...prev, customerCode: e.target.value } : prev))}
                />
              </label>
              <label>
                供应商
                <Select
                  value={source.supplierId ?? ""}
                  disabled={!isPending || actionLoading}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, supplierId: Number(e.target.value) || null } : prev))}
                >
                  <option value="">未匹配（OCR: {ocrSupplierName}）</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
                {detail.status === "pending" ? <span className="mt-1 block text-meta text-ink-subtle">确认入库前必须选择供应商</span> : null}
                {!source.supplierId && suggestedSupplier ? (
                  <span className="mt-1 block text-meta text-success">建议匹配: {suggestedSupplier.name}</span>
                ) : null}
              </label>
              <label>
                Sales Total
                <Input
                  type="number"
                  step="0.01"
                  value={source.subtotal}
                  disabled={!canEditFields}
                  onChange={(e) => {
                    if (!canEditFields) return;
                    const subtotal = Number(e.target.value) || 0;
                    setDraft((prev) => (prev ? { ...prev, subtotal, grandTotal: Number((subtotal + Number(prev.taxAmount || 0)).toFixed(2)) } : prev));
                  }}
                />
              </label>
              <label>
                Tax Total
                <Input
                  type="number"
                  step="0.01"
                  value={source.taxAmount}
                  disabled={!canEditFields}
                  onChange={(e) => {
                    if (!canEditFields) return;
                    const taxAmount = Number(e.target.value) || 0;
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            hasTax: taxAmount > 0,
                            taxAmount,
                            grandTotal: Number((Number(prev.subtotal || 0) + taxAmount).toFixed(2)),
                          }
                        : prev
                    );
                  }}
                />
              </label>
              <label>
                Total
                <Input
                  type="number"
                  step="0.01"
                  value={source.grandTotal}
                  disabled={!canEditFields}
                  onChange={(e) => canEditFields && setDraft((prev) => (prev ? { ...prev, grandTotal: Number(e.target.value) || 0 } : prev))}
                />
              </label>
              <label>
                是否应税
                <Select
                  value={source.hasTax ? "yes" : "no"}
                  disabled={!canEditFields}
                  onChange={(e) => {
                    if (!canEditFields) return;
                    const hasTax = e.target.value === "yes";
                    setDraft((prev) => {
                      if (!prev) return prev;
                      const taxAmount = hasTax ? Number(prev.taxAmount || 0) : 0;
                      return {
                        ...prev,
                        hasTax,
                        taxAmount,
                        grandTotal: Number((Number(prev.subtotal || 0) + taxAmount).toFixed(2)),
                      };
                    });
                  }}
                >
                  <option value="no">否</option>
                  <option value="yes">是</option>
                </Select>
              </label>
              <label className="sm:col-span-2 lg:col-span-4">
                备注
                <Textarea
                  rows={2}
                  value={source.notes}
                  disabled={!canEditFields}
                  onChange={(e) => canEditFields && setDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
                />
              </label>
              <p className="sm:col-span-2 lg:col-span-4">
                OCR 供应商: <span className="font-semibold">{ocrSupplierName}</span> | 供应商地址: {String(ocr?.supplierAddress || "-")} | 供应商联系方式:{" "}
                {String(ocr?.supplierContact || "-")}
              </p>
            </div>

            <div className="grid gap-2 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3">
              <p>
                商品总数量: <span className="font-semibold">{quantityTotal.toFixed(2)}</span>
              </p>
              <p>
                商品种类数: <span className="font-semibold">{kindCount}</span>
              </p>
              <p>
                Sales Total: {formatCurrency(source.subtotal)} / OCR {formatCurrency(ocrSalesTotal ?? 0)}{" "}
                <Badge tone={isClose(source.subtotal, ocrSalesTotal) ? "success" : "danger"}>
                  {isClose(source.subtotal, ocrSalesTotal) ? "一致" : "不一致"}
                </Badge>
              </p>
              <p>
                Tax Total: {formatCurrency(source.taxAmount)} / OCR {formatCurrency(ocrTaxTotal ?? 0)}{" "}
                <Badge tone={isClose(source.taxAmount, ocrTaxTotal) ? "success" : "danger"}>
                  {isClose(source.taxAmount, ocrTaxTotal) ? "一致" : "不一致"}
                </Badge>
              </p>
              <p className="sm:col-span-2 lg:col-span-1">
                Total: {formatCurrency(source.grandTotal)} / OCR {formatCurrency(ocrTotal ?? 0)}{" "}
                <Badge tone={isClose(source.grandTotal, ocrTotal) ? "success" : "danger"}>
                  {isClose(source.grandTotal, ocrTotal) ? "一致" : "不一致"}
                </Badge>
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-line bg-surface-muted p-3">
              <div className="data-table">
                <table className="min-w-[1200px] text-sm">
                <thead>
                  <tr>
                    <th className="p-2">中文名</th>
                    <th className="border-b p-2">English Name</th>
                    <th className="border-b p-2">Code</th>
                    <th className="border-b p-2">Number</th>
                    <th className="border-b p-2">UN</th>
                    <th className="border-b p-2">Tax</th>
                    <th className="border-b p-2">数量</th>
                    <th className="border-b p-2">单位</th>
                    <th className="border-b p-2">单价</th>
                    <th className="border-b p-2">小计</th>
                  </tr>
                </thead>
                <tbody>
                  {source.items.map((line, index) => (
                    <tr key={line.id} className="align-top">
                      <td className="p-2">
                        {canEditFields ? (
                          <Input value={line.productNameZh} onChange={(e) => updateDraftItem(index, { productNameZh: e.target.value })} />
                        ) : (
                          line.productNameZh || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {canEditFields ? (
                          <Input value={line.productNameEn} onChange={(e) => updateDraftItem(index, { productNameEn: e.target.value })} />
                        ) : (
                          <span className="font-medium text-ink">{line.productNameEn || "-"}</span>
                        )}
                      </td>
                      <td className="p-2">
                        {canEditFields ? (
                          <Input value={line.productCode} onChange={(e) => updateDraftItem(index, { productCode: e.target.value })} />
                        ) : (
                          line.productCode || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {canEditFields ? (
                          <Input value={line.productNumber} onChange={(e) => updateDraftItem(index, { productNumber: e.target.value })} />
                        ) : (
                          line.productNumber || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {canEditFields ? (
                          <Input value={line.un} onChange={(e) => updateDraftItem(index, { un: e.target.value.toUpperCase() })} />
                        ) : (
                          line.un || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {canEditFields ? (
                          <Select value={line.taxCode} onChange={(e) => updateDraftItem(index, { taxCode: (e.target.value as "E" | "H") || "E" })}>
                            <option value="E">E</option>
                            <option value="H">H</option>
                          </Select>
                        ) : (
                          <Badge tone={line.taxCode === "H" ? "warning" : "default"}>{line.taxCode}</Badge>
                        )}
                      </td>
                      <td className="p-2">
                        {canEditFields ? (
                          <Input
                            type="number"
                            value={line.quantity}
                            onChange={(e) => updateDraftItem(index, { quantity: Number(e.target.value) || 0 })}
                          />
                        ) : (
                          line.quantity
                        )}
                      </td>
                      <td className="p-2">
                        {canEditFields ? (
                          <Input value={line.unit} onChange={(e) => updateDraftItem(index, { unit: e.target.value })} />
                        ) : (
                          line.unit
                        )}
                      </td>
                      <td className="p-2">
                        {canEditFields ? (
                          <Input
                            type="number"
                            value={line.unitPrice}
                            onChange={(e) => updateDraftItem(index, { unitPrice: Number(e.target.value) || 0 })}
                          />
                        ) : (
                          formatCurrency(line.unitPrice)
                        )}
                      </td>
                      <td className="p-2 font-semibold">
                        {canEditFields ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={line.lineTotal}
                            onChange={(e) => updateDraftItem(index, { lineTotal: Number(e.target.value) || 0 })}
                          />
                        ) : (
                          formatCurrency(line.lineTotal)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/95 p-3 backdrop-blur">
              <Badge tone={detail.status === "confirmed" ? "success" : detail.status === "rejected" ? "danger" : "warning"}>
                {detail.status === "confirmed" ? "已确认" : detail.status === "rejected" ? "已驳回" : "待处理"}
              </Badge>

              {detail.status === "pending" ? (
                <>
                  <Button
                    variant={editing ? "ghost" : "secondary"}
                    onClick={() => {
                      if (editing) {
                        setEditing(false);
                        setDraft(detail ? toEditableInvoice(detail) : null);
                        return;
                      }
                      setEditing(true);
                    }}
                    disabled={actionLoading}
                  >
                    {editing ? "退出编辑" : "进入编辑"}
                  </Button>

                  {editing ? (
                    <Button variant="secondary" onClick={recalculateDraftTotals} disabled={actionLoading}>
                      重新计算
                    </Button>
                  ) : null}

                  <Button onClick={() => void handleSaveUpdate()} disabled={actionLoading || !editing}>
                    {actionLoading ? "保存中..." : "保存修改"}
                  </Button>

                  <Button variant="secondary" onClick={() => void handleConfirm()} disabled={actionLoading}>
                    {actionLoading ? "处理中..." : "确认入库"}
                  </Button>

                  {isAdmin ? (
                    <Button variant="danger" onClick={() => void handleDelete()} disabled={actionLoading}>
                      删除发票
                    </Button>
                  ) : null}
                </>
              ) : detail.status === "rejected" && isAdmin ? (
                <Button variant="danger" onClick={() => void handleDelete()} disabled={actionLoading}>
                  删除发票
                </Button>
              ) : detail.status === "confirmed" && isAdmin ? (
                <Button variant="secondary" onClick={() => void handleRollbackConfirm()} disabled={actionLoading}>
                  回滚未确认
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
