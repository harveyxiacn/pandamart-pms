import { formatNumber } from "../utils/formatters";
import { categoryName } from "../i18n";
import { productName, t, useLanguage } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Boxes, ClipboardCheck, PackageSearch, AlertTriangle, CalendarClock } from "lucide-react";
import { adjustInventory, getInventory, getInventoryLogs, setSafeStock } from "../api/inventory";
import type { InventoryItem, InventorySummary } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Table, Td, Th } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Field } from "../components/ui/Field";
import { Select } from "../components/ui/Select";
import { SearchInput } from "../components/ui/SearchInput";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { StatCard } from "../components/ui/StatCard";
import { Toolbar, ToolbarGroup } from "../components/ui/Toolbar";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Pagination } from "../components/ui/Pagination";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { usePermission } from "../hooks/usePermission";
import { useDebounce } from "../hooks/useDebounce";
import { formatDate, formatDateTime } from "../utils/formatters";
import { cn } from "../utils/classnames";

type InventoryLog = {
  id: number;
  type: string;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  invoiceNumber: string | null;
  reason: string | null;
  operatedBy: string | null;
  createdAt: string;
};

const logTypeLabels: Record<string, string> = {
  get inbound() { return t("入库"); },
  get outbound() { return t("出库"); },
  get adjust() { return t("调整"); },
  get stocktake() { return t("盘点"); },
  get sale() { return t("销售"); },
  get void() { return t("作废"); },
};

export default function InventoryPage() {
  useLanguage();
  const navigate = useNavigate();
  const { canAdjustInventory, canAdjustSafeStock } = usePermission();
  const toast = useToast();
  const [keyword, setKeyword] = useState("");
  const [alertOnly, setAlertOnly] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [actionProduct, setActionProduct] = useState<InventoryItem | null>(null);
  const [actionType, setActionType] = useState<"adjust" | "out" | "stocktake">("adjust");
  const [actionQty, setActionQty] = useState(0);
  const [actionReason, setActionReason] = useState("");
  const [safeStockValue, setSafeStockValue] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const reqIdRef = useRef(0);

  const load = async (targetPage = page, targetPageSize = pageSize) => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getInventory({
        page: targetPage,
        pageSize: targetPageSize,
        keyword: keyword || undefined,
        alertOnly,
      });
      if (myReq !== reqIdRef.current) return;
      setItems(data.items);
      setSummary(data.summary);
      setTotal(data.pagination.total);
      setPage(data.pagination.page);
    } catch (err: unknown) {
      if (myReq !== reqIdRef.current) return;
      setError(err instanceof Error ? err.message : t("加载库存失败"));
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  };

  const debouncedKeyword = useDebounce(keyword, 400);

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, alertOnly]);

  const openAdjust = async (item: InventoryItem) => {
    setActionProduct(item);
    setActionType("adjust");
    setActionQty(0);
    setActionReason("");
    setSafeStockValue(item.safeStock ?? 0);
    try {
      const logRes = await getInventoryLogs(item.product.id, { pageSize: 10 });
      setLogs(logRes.items as InventoryLog[]);
    } catch (err: unknown) {
      setLogs([]);
      toast.error(err instanceof Error ? err.message : t("加载库存日志失败"));
    }
  };

  const submitAdjust = async () => {
    if (!actionProduct) return;
    setSubmitting(true);
    try {
      await adjustInventory(actionProduct.product.id, {
        type: actionType,
        quantity: actionQty,
        reason: actionReason,
      });
      toast.success(t("库存已调整"));
      await load();
      setActionProduct(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("库存调整失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("库存管理")}
        description={t("查看实时库存与安全库存线，处理补货和盘亏盘盈。")}
        actions={
          <>
            <Button variant="secondary" leadingIcon={CalendarClock} onClick={() => navigate("/batches")}>{t("批次保质期")}</Button>
            {canAdjustInventory ? (
              <Button leadingIcon={ClipboardCheck} onClick={() => navigate("/stocktake")}>{t("库存盘点")}</Button>
            ) : null}
          </>
        }
      />

      {summary ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label={t("在管商品")} value={summary.totalProducts} icon={Boxes} tone="neutral" hint={t("已建立库存记录")} />
          <StatCard
            label={t("低库存")}
            value={summary.lowStockCount}
            icon={AlertTriangle}
            tone={summary.lowStockCount > 0 ? "warning" : "success"}
            hint={t("低于安全库存线")}
          />
          <StatCard
            label={t("缺货")}
            value={summary.outOfStockCount}
            icon={PackageSearch}
            tone={summary.outOfStockCount > 0 ? "danger" : "success"}
            hint={t("库存为 0，需立即补货")}
          />
        </section>
      ) : null}

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
              placeholder={t("搜索产品名或 SKU")}
              aria-label={t("搜索库存")}
              containerClassName="w-full sm:max-w-xs"
            />
          </ToolbarGroup>
          <ToolbarGroup>
            <SegmentedControl
              label={t("库存范围")}
              value={alertOnly ? "low" : "all"}
              onChange={(value) => setAlertOnly(value === "low")}
              options={[
                { value: "all", label: t("全部库存") },
                { value: "low", label: t("仅低库存") },
              ]}
            />
          </ToolbarGroup>
        </Toolbar>
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        {loading ? <SkeletonTable rows={6} columns={6} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={Boxes}
            title={t("加载失败")}
            description={error}
            action={
              <Button variant="ghost" onClick={() => void load()}>{t("重试")}</Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={alertOnly ? t("没有低库存商品") : t("暂无库存记录")}
            description={
              alertOnly
                ? t("所有商品都高于安全库存线。")
                : t("确认采购发票后，库存会自动建立并更新。")
            }
          />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("商品")}</Th>
                  <Th numeric>{t("当前库存")}</Th>
                  <Th numeric>{t("安全库存")}</Th>
                  <Th>{t("补货水位")}</Th>
                  <Th>{t("最近入库")}</Th>
                  <Th className="cell-actions">{t("操作")}</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const safe = item.safeStock ?? 0;
                  const ratio = safe > 0 ? Math.min(100, Math.round((item.quantity / safe) * 100)) : 100;
                  return (
                    <tr key={item.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-inset text-ink-subtle">
                            <Boxes size={14} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="cell-strong truncate">
                              {productName(item.product.nameZh, item.product.nameEn)}
                            </p>
                            <p className="truncate text-meta text-ink-subtle">
                              {item.product.sku || t("无 SKU")}
                              {item.product.category ? ` · ${categoryName(item.product.category)}` : ""}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td numeric>
                        <span className={cn("font-semibold", item.isLowStock ? "text-danger" : "text-ink")}>
                          {formatNumber(Number(item.quantity))}
                        </span>
                        <span className="ml-1 text-meta text-ink-subtle">{item.unit}</span>
                      </Td>
                      <Td numeric>{item.safeStock ?? "—"}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-inset">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                ratio < 50 ? "bg-danger" : ratio < 100 ? "bg-warning" : "bg-success"
                              )}
                              style={{ width: `${Math.max(ratio, 3)}%` }}
                            />
                          </div>
                          <Badge tone={item.isLowStock ? "warning" : "success"} size="sm">
                            {item.isLowStock ? t("需补货") : t("正常")}
                          </Badge>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-meta">
                        {item.lastRestockDate ? (
                          <span className="tabular">
                            {formatDate(item.lastRestockDate)}
                            {item.lastRestockQuantity != null ? ` · +${item.lastRestockQuantity}` : ""}
                          </span>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </Td>
                      <Td className="cell-actions">
                        {canAdjustInventory ? (
                          <Button variant="secondary" size="sm" onClick={() => void openAdjust(item)}>{t("调整")}</Button>
                        ) : (
                          <Link to="/sales" className="text-meta text-accent hover:underline">{t("去收银")}</Link>
                        )}
                      </Td>
                    </tr>
                  );
                })}
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
                  void load(1, size);
                }}
              />
            </div>
          </>
        ) : null}
      </Card>

      <Modal
        open={canAdjustInventory && actionProduct !== null}
        onClose={() => setActionProduct(null)}
        title={t("库存调整")}
        description={
          actionProduct
            ? t("{0} · 当前 {1} {2}", productName(actionProduct.product.nameZh, actionProduct.product.nameEn), actionProduct.quantity, actionProduct.unit)
            : undefined
        }
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setActionProduct(null)}>{t("取消")}</Button>
            <Button onClick={() => void submitAdjust()} loading={submitting}>{t("提交调整")}</Button>
          </>
        }
      >
        {actionProduct ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("调整类型")} htmlFor="adjust-type">
                <Select
                  id="adjust-type"
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as typeof actionType)}
                >
                  <option value="adjust">{t("调整（增减）")}</option>
                  <option value="out">{t("出库")}</option>
                  <option value="stocktake">{t("盘点（设为实际值）")}</option>
                </Select>
              </Field>
              <Field
                label={actionType === "stocktake" ? t("实际数量") : t("数量变化")}
                htmlFor="adjust-qty"
                hint={actionType === "adjust" ? t("正数增加，负数减少") : undefined}
              >
                <Input
                  id="adjust-qty"
                  type="number"
                  value={actionQty}
                  onChange={(e) => setActionQty(Number(e.target.value))}
                />
              </Field>
              <Field label={t("原因")} htmlFor="adjust-reason">
                <Input
                  id="adjust-reason"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={t("可选")}
                />
              </Field>
            </div>

            {canAdjustSafeStock ? (
              <div className="rounded-lg border border-line bg-surface-muted p-3">
                <Field label={t("安全库存")} htmlFor="safe-stock" hint={t("低于该值时进入补货提醒")}>
                  <div className="flex gap-2">
                    <Input
                      id="safe-stock"
                      type="number"
                      value={safeStockValue}
                      onChange={(e) => setSafeStockValue(Number(e.target.value))}
                    />
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await setSafeStock(actionProduct.product.id, safeStockValue);
                          toast.success(t("安全库存已保存"));
                          await load();
                        } catch (err: unknown) {
                          toast.error(err instanceof Error ? err.message : t("安全库存保存失败"));
                        }
                      }}
                    >{t("保存")}</Button>
                  </div>
                </Field>
              </div>
            ) : null}

            <div>
              <h3 className="mb-2 text-meta font-semibold uppercase tracking-wider text-ink-subtle">{t("最近库存变动")}</h3>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface p-2">
                {logs.length === 0 ? (
                  <p className="px-1 py-2 text-meta text-ink-subtle">{t("暂无变动记录")}</p>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-meta hover:bg-surface-muted"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink-muted">
                          {logTypeLabels[log.type] ?? log.type}
                          {log.reason ? ` · ${log.reason}` : ""}
                        </p>
                        <p className="text-[11px] text-ink-subtle">
                          {formatDateTime(log.createdAt)}
                          {log.operatedBy ? ` · ${log.operatedBy}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 tabular text-ink-subtle">
                        {formatNumber(Number(log.quantityBefore))} → <span className="font-semibold text-ink">{formatNumber(Number(log.quantityAfter))}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
