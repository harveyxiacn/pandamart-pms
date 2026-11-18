import { productName, t, useLanguage } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import { Ban, MoreHorizontal, Plus, Receipt, ShoppingCart, Trash2 } from "lucide-react";
import { getAllProducts } from "../api/products";
import { createSale, getSales, voidSale, type SaleSummary } from "../api/sales";
import type { Product } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Table, Td, Th } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Field } from "../components/ui/Field";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Drawer } from "../components/ui/Drawer";
import { StatCard } from "../components/ui/StatCard";
import { Toolbar, ToolbarGroup } from "../components/ui/Toolbar";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { DateRangePicker } from "../components/ui/DatePicker";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { Pagination } from "../components/ui/Pagination";
import { DropdownMenu, DropdownMenuItem } from "../components/ui/DropdownMenu";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useAuth } from "../hooks/useAuth";
import { formatCurrency, formatDateTime } from "../utils/formatters";
import type { DateRange } from "../utils/date";
import { cn } from "../utils/classnames";

const PAGE_SIZE = 20;

interface DraftLine {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export default function SalesPage() {
  useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdmin } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const [selProduct, setSelProduct] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const [orders, setOrders] = useState<SaleSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | "completed" | "voided">("");
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });

  const loadProducts = async () => {
    try {
      setProducts(await getAllProducts());
    } catch {
      // 商品加载失败不阻塞页面，提交时再校验
    }
  };

  const loadOrders = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSales({
        page: targetPage,
        pageSize: PAGE_SIZE,
        status: status || undefined,
        dateFrom: dateRange.start || undefined,
        dateTo: dateRange.end || undefined,
      });
      if (res.items.length === 0 && targetPage > 1) {
        await loadOrders(targetPage - 1);
        return;
      }
      setOrders(res.items);
      setPage(res.pagination.page);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("销售记录加载失败"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadOrders(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dateRange.start, dateRange.end]);

  const grandTotal = useMemo(
    () => draft.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [draft]
  );
  const completedTotal = useMemo(
    () => orders.filter((o) => o.status === "completed").reduce((sum, o) => sum + o.total, 0),
    [orders]
  );

  function onSelectProduct(id: string) {
    setSelProduct(id);
    const p = products.find((x) => String(x.id) === id);
    const suggested = p?.selling_price ?? p?.default_price ?? null;
    if (suggested != null) setPrice(String(suggested));
  }

  function addLine() {
    const productId = Number(selProduct);
    const quantity = Number(qty);
    const unitPrice = Number(price);
    if (!productId) {
      toast.error(t("请选择商品"));
      return;
    }
    if (!(quantity > 0)) {
      toast.error(t("数量必须大于 0"));
      return;
    }
    if (!(unitPrice >= 0)) {
      toast.error(t("单价无效"));
      return;
    }
    const p = products.find((x) => x.id === productId);
    const name = p ? productName(p.name_zh, p.name_en) : `#${productId}`;
    setDraft((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === productId ? { ...l, quantity: l.quantity + quantity, unitPrice } : l
        );
      }
      return [...prev, { productId, name, quantity, unitPrice }];
    });
    setSelProduct("");
    setQty("1");
    setPrice("");
  }

  function removeLine(productId: number) {
    setDraft((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function submitSale() {
    if (draft.length === 0) {
      toast.error(t("请先添加商品"));
      return;
    }
    setSubmitting(true);
    try {
      await createSale({
        items: draft.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
        note: note || null,
      });
      toast.success(t("销售出库成功，合计 {0}", formatCurrency(grandTotal)));
      setDraft([]);
      setNote("");
      setComposerOpen(false);
      void loadOrders(1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("销售出库失败"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVoid(order: SaleSummary) {
    const ok = await confirm({
      title: t("作废销售单"),
      message: t("确认作废 {0}？此操作会把已售出的库存回补，且不可撤销。", order.orderNo),
      confirmText: t("作废并回补"),
      danger: true,
    });
    if (!ok) return;
    try {
      await voidSale(order.id);
      toast.success(t("销售单已作废，库存已回补"));
      void loadOrders(page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("作废失败"));
    }
  }

  const hasFilters = Boolean(status || dateRange.start || dateRange.end);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("销售出库")}
        description={t("现场收银出库，自动按 FIFO 扣减批次并回写库存。")}
        actions={
          <Button leadingIcon={Plus} onClick={() => setComposerOpen(true)}>{t("新建销售单")}</Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("本页销售额")}
          value={formatCurrency(completedTotal)}
          icon={Receipt}
          tone="accent"
          hint={t("{0} 笔已完成", orders.filter((o) => o.status === "completed").length)}
        />
        <StatCard label={t("本页订单")} value={orders.length} icon={ShoppingCart} hint={t("含已作废订单")} />
        <StatCard
          label={t("待处理草稿")}
          value={draft.length}
          icon={Plus}
          tone={draft.length > 0 ? "warning" : "neutral"}
          hint={draft.length > 0 ? t("合计 {0}", formatCurrency(grandTotal)) : t("暂无草稿")}
        />
      </section>

      <Card>
        <Toolbar>
          <ToolbarGroup grow>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              label={t("按销售日期筛选")}
              className="w-auto min-w-[13rem]"
            />
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus("");
                  setDateRange({ start: null, end: null });
                }}
              >{t("清除筛选")}</Button>
            ) : null}
          </ToolbarGroup>
          <ToolbarGroup>
            <SegmentedControl
              label={t("订单状态")}
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: t("全部") },
                { value: "completed", label: t("已完成") },
                { value: "voided", label: t("已作废") },
              ]}
            />
          </ToolbarGroup>
        </Toolbar>
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-title font-semibold tracking-tight text-ink">{t("销售记录")}</h2>
          <span className="text-meta text-ink-subtle">{t("共")} <span className="font-medium tabular text-ink-muted">{total}</span> {t("笔")}</span>
        </div>
        {loading ? (
          <SkeletonTable rows={5} columns={6} />
        ) : error ? (
          <EmptyState
            icon={Receipt}
            title={t("加载失败")}
            description={error}
            action={
              <Button variant="ghost" onClick={() => void loadOrders(page)}>{t("重试")}</Button>
            }
          />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={hasFilters ? t("没有符合条件的销售单") : t("暂无销售记录")}
            description={hasFilters ? t("试试放宽日期范围。") : t("完成第一笔销售后，记录会显示在这里。")}
            action={
              !hasFilters ? (
                <Button leadingIcon={Plus} onClick={() => setComposerOpen(true)}>{t("新建销售单")}</Button>
              ) : null
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("单号")}</Th>
                  <Th>{t("状态")}</Th>
                  <Th numeric>{t("金额")}</Th>
                  <Th>{t("操作员")}</Th>
                  <Th>{t("时间")}</Th>
                  {isAdmin ? <Th className="cell-actions">{t("操作")}</Th> : null}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <Td className="font-mono text-meta text-ink">{o.orderNo}</Td>
                    <Td>
                      {o.status === "voided" ? (
                        <Badge tone="danger">{t("已作废")}</Badge>
                      ) : (
                        <Badge tone="success">{t("已完成")}</Badge>
                      )}
                    </Td>
                    <Td numeric className={cn("font-semibold", o.status === "voided" ? "text-ink-subtle line-through" : "text-ink")}>
                      {formatCurrency(o.total)}
                    </Td>
                    <Td>{o.soldBy || <span className="text-ink-subtle">—</span>}</Td>
                    <Td className="whitespace-nowrap tabular text-meta">{formatDateTime(o.createdAt)}</Td>
                    {isAdmin ? (
                      <Td className="cell-actions">
                        {o.status === "completed" ? (
                          <DropdownMenu
                            label={t("{0} 操作", o.orderNo)}
                            trigger={(props) => (
                              <Button {...props} variant="ghost" size="sm" iconOnly aria-label={t("更多操作")}>
                                <MoreHorizontal size={16} aria-hidden="true" />
                              </Button>
                            )}
                          >
                            <DropdownMenuItem icon={Ban} tone="danger" onSelect={() => void handleVoid(o)}>{t("作废并回补库存")}</DropdownMenuItem>
                          </DropdownMenu>
                        ) : (
                          <span className="text-meta text-ink-subtle">—</span>
                        )}
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(p) => void loadOrders(p)} />
            </div>
          </>
        )}
      </Card>

      <Drawer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title={t("新建销售单")}
        description={t("选择商品、数量和单价，确认后立即扣减库存。")}
        widthClassName="sm:max-w-[34rem]"
        footer={
          <>
            <Button variant="ghost" onClick={() => setComposerOpen(false)}>{t("取消")}</Button>
            <Button
              onClick={() => void submitSale()}
              loading={submitting}
              disabled={draft.length === 0}
            >
              {draft.length > 0 ? t("提交销售 · {0}", formatCurrency(grandTotal)) : t("提交销售")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_4.5rem_5.5rem]">
            <Field label={t("商品")} htmlFor="sale-product">
              <Select
                id="sale-product"
                value={selProduct}
                onChange={(e) => onSelectProduct(e.target.value)}
              >
                <option value="">{t("选择商品…")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {productName(p.name_zh, p.name_en)}
                    {p.sku ? ` · ${p.sku}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("数量")} htmlFor="sale-qty">
              <Input
                id="sale-qty"
                type="number"
                min="0"
                step="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </Field>
            <Field label={t("单价")} htmlFor="sale-price">
              <Input
                id="sale-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Field>
          </div>

          <Button variant="secondary" leadingIcon={Plus} onClick={addLine} fullWidth>{t("添加到销售单")}</Button>

          <div className="rounded-xl border border-line">
            {draft.length === 0 ? (
              <p className="px-4 py-8 text-center text-meta text-ink-subtle">{t("还没有商品。选择商品后点「添加到销售单」。")}</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {draft.map((line) => (
                  <li key={line.productId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-ink">{line.name}</p>
                      <p className="text-meta tabular text-ink-subtle">
                        {line.quantity} × {formatCurrency(line.unitPrice)}
                      </p>
                    </div>
                    <span className="shrink-0 text-body font-semibold tabular text-ink">
                      {formatCurrency(line.quantity * line.unitPrice)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(line.productId)}
                      aria-label={t("移除 {0}", line.name)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-line bg-surface-muted px-4 py-3">
              <span className="text-meta text-ink-muted">{t("合计")}</span>
              <span className="text-title font-semibold tabular text-ink">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          <Field label={t("备注")} htmlFor="sale-note">
            <Input
              id="sale-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("可选，例如发票号或客户说明")}
            />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
