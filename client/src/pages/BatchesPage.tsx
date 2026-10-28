import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
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
import { Card } from "../components/ui/Card";
import { Table } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { Pagination } from "../components/ui/Pagination";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { usePermission } from "../hooks/usePermission";
import { formatDate } from "../utils/formatters";

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
      setError(err instanceof Error ? err.message : "批次数据加载失败");
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
      toast.error("请选择商品");
      return;
    }
    if (!(Number(qty) > 0)) {
      toast.error("数量必须大于 0");
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
      toast.success("批次入库成功");
      setProductId("");
      setQty("");
      setExpiry("");
      setBatchNo("");
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "批次入库失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDispose(batch: Batch) {
    const ok = await confirm({
      title: "批次报损",
      message: `确认将「${batch.nameZh || batch.nameEn}」该批次剩余 ${batch.quantity} 全部报损？库存将相应扣减。`,
      confirmText: "报损",
      danger: true,
    });
    if (!ok) return;
    try {
      await disposeBatch(batch.id, { reason: "过期报损" });
      toast.success("已报损并扣减库存");
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "报损失败");
    }
  }

  function expiryBadge(b: { expiryDate: string | null }) {
    const d = daysUntil(b.expiryDate);
    if (d === null) return <Badge>无保质期</Badge>;
    if (d < 0) return <Badge tone="danger">已过期 {-d} 天</Badge>;
    if (d <= 7) return <Badge tone="warning">{d} 天后到期</Badge>;
    return <Badge tone="success">{d} 天</Badge>;
  }

  return (
    <div className="space-y-4">
      {/* 临期/过期预警概览 */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-slate-500">已过期批次</p>
          <p className="text-2xl font-bold text-danger">{expiring?.expiredCount ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">7 天内临期</p>
          <p className="text-2xl font-bold text-amber-600">{expiring?.expiringCount ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">在库批次</p>
          <p className="text-2xl font-bold text-pine">{batches.length}</p>
        </Card>
      </section>

      {canEditCatalog ? (
        <Card>
          <h2 className="mb-3 text-lg font-bold">收货入批次</h2>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
            <Select value={productId} onChange={(e) => onSelectProduct(e.target.value)} aria-label="选择商品">
              <option value="">选择商品…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_en}
                  {p.name_zh ? ` (${p.name_zh})` : ""}
                  {p.sku ? ` · ${p.sku}` : ""}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="数量"
              className="w-24"
              aria-label="数量"
            />
            <Input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-40"
              aria-label="到期日"
            />
            <Input
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              placeholder="批次号(可选)"
              className="w-32"
              aria-label="批次号"
            />
            <Button onClick={() => void addBatch()} disabled={saving}>
              {saving ? "提交中…" : "入库"}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-lg font-bold">在库批次（按到期日排序）</h2>
        {loading ? (
          <SkeletonTable rows={6} columns={6} />
        ) : error ? (
          <div className="space-y-2 text-sm">
            <p className="text-danger">{error}</p>
            <Button variant="ghost" onClick={() => void load()}>
              重试
            </Button>
          </div>
        ) : batches.length === 0 ? (
          <EmptyState icon={CalendarClock} title="暂无在库批次" description="收货时录入批次与保质期即可在此跟踪临期。确认入库发票时填写批次信息，系统会自动提醒临期商品。" />
        ) : (
          <Table>
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="px-3 py-2">商品</th>
                <th className="px-3 py-2">批次号</th>
                <th className="px-3 py-2">数量</th>
                <th className="px-3 py-2">到期日</th>
                <th className="px-3 py-2">状态</th>
                {canEditCatalog ? <th className="px-3 py-2"></th> : null}
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-slate-100 text-sm">
                  <td className="px-3 py-2">
                    {b.nameZh || b.nameEn}
                    <div className="text-xs text-slate-500">{b.nameEn}</div>
                  </td>
                  <td className="px-3 py-2">{b.batchNo || "-"}</td>
                  <td className="px-3 py-2">{b.quantity}</td>
                  <td className="px-3 py-2">{b.expiryDate ? formatDate(b.expiryDate) : "-"}</td>
                  <td className="px-3 py-2">{expiryBadge(b)}</td>
                  {canEditCatalog ? (
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" onClick={() => void handleDispose(b)}>
                        报损
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!loading && !error && batches.length > 0 ? (
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
        ) : null}
      </Card>
    </div>
  );
}
