import { formatNumber } from "../utils/formatters";
import { productName, t, useLanguage } from "../i18n";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, PackagePlus, Boxes } from "lucide-react";
import { getAllProducts } from "../api/products";
import {
  createBatch,
  disposeBatch,
  getBatches,
  getExpiringBatches,
  type Batch,
  type ExpiringSummary,
} from "../api/batches";
import type { Product } from "../types";
import { Card, CardHeader } from "../components/ui/Card";
import { Table, Td, Th } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Field } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { PageHeader } from "../components/ui/PageHeader";
import { DatePicker } from "../components/ui/DatePicker";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { Pagination } from "../components/ui/Pagination";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { usePermission } from "../hooks/usePermission";
import { formatISO } from "../utils/date";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  // 只比较日历日期，避免 'YYYY-MM-DD'(按 UTC 解析) 与本地时区相减产生的 ±1 天偏差
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const expiry = new Date(y, m - 1, d);
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
}

export default function BatchesPage() {
  useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEditCatalog } = usePermission();

  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [expiring, setExpiring] = useState<ExpiringSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 服务端 pageSize 上限 100：批次列表改为真实分页，避免在库批次超出一页时被截断
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // 新批次表单
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [expiry, setExpiry] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const [prodList, batchRes, expRes] = await Promise.all([
        // 跨页拉取全部商品：服务端 pageSize 上限 100，直接请求 1000 会漏掉第 100 个之后的商品
        getAllProducts(),
        getBatches({ status: "active", page: targetPage, pageSize: targetPageSize }),
        getExpiringBatches(7),
      ]);
      setProducts(prodList);
      setBatches(batchRes.items);
      setTotal(batchRes.pagination.total);
      setPage(batchRes.pagination.page);
      setExpiring(expRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("批次数据加载失败"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSelectProduct(id: string) {
    setProductId(id);
    const p = products.find((x) => String(x.id) === id);
    // 配置了货架期则预填到期日（收货日 + 货架期）
    if (p?.shelf_life_days) {
      const d = new Date(Date.now() + p.shelf_life_days * 86400000);
      setExpiry(d.toISOString().slice(0, 10));
    }
  }

  async function addBatch() {
    if (!productId) {
      toast.error(t("请选择商品"));
      return;
    }
    if (!(Number(qty) > 0)) {
      toast.error(t("数量必须大于 0"));
      return;
    }
    setSaving(true);
    try {
      await createBatch({
        productId: Number(productId),
        quantity: Number(qty),
        expiryDate: expiry || null,
        batchNo: batchNo || null,
      });
      toast.success(t("批次入库成功"));
      setProductId("");
      setQty("");
      setExpiry("");
      setBatchNo("");
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("批次入库失败"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDispose(batch: Batch) {
    const ok = await confirm({
      title: t("批次报损"),
      message: t("确认将「{0}」该批次剩余 {1} 全部报损？库存将相应扣减。", productName(batch.nameZh, batch.nameEn), batch.quantity),
      confirmText: t("报损"),
      danger: true,
    });
    if (!ok) return;
    try {
      await disposeBatch(batch.id, { reason: "过期报损" });
      toast.success(t("已报损并扣减库存"));
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("报损失败"));
    }
  }

  function expiryBadge(b: { expiryDate: string | null }) {
    const d = daysUntil(b.expiryDate);
    if (d === null) return <Badge>{t("无保质期")}</Badge>;
    if (d < 0) return <Badge tone="danger">{t("已过期")} {-d} {t("天")}</Badge>;
    if (d <= 7) return <Badge tone="warning">{d} {t("天后到期")}</Badge>;
    return <Badge tone="success">{d} {t("天")}</Badge>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("批次与保质期")}
        description={t("按收货批次跟踪库存和到期日，临期商品优先售出，过期批次及时报损。")}
        meta={t("当前页 {0} 个批次 · 共 {1} 个在库批次", batches.length, total)}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("已过期批次")}
          value={expiring?.expiredCount ?? 0}
          icon={AlertTriangle}
          tone="danger"
          hint={t("需要立即报损下架")}
        />
        <StatCard
          label={t("7 天内临期")}
          value={expiring?.expiringCount ?? 0}
          icon={CalendarClock}
          tone="warning"
          hint={t("建议优先陈列销售")}
        />
        <StatCard
          label={t("在库批次")}
          value={total}
          icon={Boxes}
          tone="accent"
          hint={t("状态为 active 的批次")}
        />
      </section>

      {canEditCatalog ? (
        <Card>
          <CardHeader
            title={t("收货入批次")}
            description={t("选择商品后按货架期自动预填到期日，可手动调整。")}
            action={
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <PackagePlus size={16} aria-hidden="true" />
              </span>
            }
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto] lg:items-end">
            <Field label={t("商品")} htmlFor="batch-product">
              <Select id="batch-product" value={productId} onChange={(e) => onSelectProduct(e.target.value)}>
                <option value="">{t("选择商品…")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {productName(p.name_zh, p.name_en)}
                    {p.sku ? ` · ${p.sku}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("数量")} htmlFor="batch-qty">
              <Input
                id="batch-qty"
                type="number"
                min="0"
                step="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                inputMode="decimal"
              />
            </Field>
            <Field label={t("到期日")} htmlFor="batch-expiry" hint={t("可留空")}>
              <DatePicker
                id="batch-expiry"
                value={expiry || null}
                onChange={(value) => setExpiry(value ?? "")}
                label={t("批次到期日")}
                clearable
              />
            </Field>
            <Field label={t("批次号")} htmlFor="batch-no" hint={t("可选")}>
              <Input
                id="batch-no"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder={t("如 LOT-20261029")}
              />
            </Field>
            <Button onClick={() => void addBatch()} loading={saving} className="h-9 sm:col-span-2 lg:col-span-1">{t("入库")}</Button>
          </div>
        </Card>
      ) : null}

      <Card padded={false} className="p-4 sm:p-5">
        <CardHeader
          title={t("在库批次")}
          description={t("按到期日排序，报损会扣减对应批次的库存。")}
          className="mb-3"
        />
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
        {!loading && !error && batches.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t("暂无在库批次")}
            description={t("收货时录入批次与保质期即可在此跟踪临期。确认入库发票时填写批次信息，系统会自动提醒临期商品。")}
          />
        ) : null}
        {!loading && !error && batches.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("商品")}</Th>
                  <Th>{t("批次号")}</Th>
                  <Th numeric>{t("数量")}</Th>
                  <Th>{t("到期日")}</Th>
                  <Th>{t("状态")}</Th>
                  {canEditCatalog ? <Th className="cell-actions">{t("操作")}</Th> : null}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      <p className="cell-strong">{productName(b.nameZh, b.nameEn)}</p>
                      <p className="text-meta text-ink-subtle">{b.nameEn}</p>
                    </Td>
                    <Td className="font-mono text-meta text-ink-muted">{b.batchNo || "—"}</Td>
                    <Td numeric className="font-semibold">{formatNumber(Number(b.quantity))}</Td>
                    <Td className="whitespace-nowrap tabular text-meta">
                      {b.expiryDate ? formatISO(b.expiryDate) : "—"}
                    </Td>
                    <Td>{expiryBadge(b)}</Td>
                    {canEditCatalog ? (
                      <Td className="cell-actions">
                        <Button variant="danger-ghost" size="sm" onClick={() => void handleDispose(b)}>{t("报损")}</Button>
                      </Td>
                    ) : null}
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
                  void load(1, size);
                }}
              />
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
