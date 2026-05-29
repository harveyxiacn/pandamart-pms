import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { getProducts } from "../api/products";
import { createSale, getSales, voidSale, type SaleSummary } from "../api/sales";
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
import { useAuth } from "../hooks/useAuth";
import { formatCurrency, formatDateTime } from "../utils/formatters";

const PAGE_SIZE = 20;

interface DraftLine {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export default function SalesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdmin } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 新增行的临时输入
  const [selProduct, setSelProduct] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const [orders, setOrders] = useState<SaleSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = async () => {
    try {
      const res = await getProducts({ pageSize: 1000 });
      setProducts(res.items);
    } catch {
      // 商品加载失败不阻塞页面，提交时再校验
    }
  };

  const loadOrders = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSales({ page: targetPage, pageSize: PAGE_SIZE });
      // 当前页已无数据但不是第一页（如在末页作废了最后一条）→ 回退到上一页
      if (res.items.length === 0 && targetPage > 1) {
        await loadOrders(targetPage - 1);
        return;
      }
      setOrders(res.items);
      setPage(res.pagination.page);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "销售记录加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
    void loadOrders(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grandTotal = useMemo(
    () => draft.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [draft]
  );

  function onSelectProduct(id: string) {
    setSelProduct(id);
    const p = products.find((x) => String(x.id) === id);
    // 优先用零售售价；未设置时退回进价作为参考
    const suggested = p?.selling_price ?? p?.default_price ?? null;
    if (suggested != null) setPrice(String(suggested));
  }

  function addLine() {
    const productId = Number(selProduct);
    const quantity = Number(qty);
    const unitPrice = Number(price);
    if (!productId) {
      toast.error("请选择商品");
      return;
    }
    if (!(quantity > 0)) {
      toast.error("数量必须大于 0");
      return;
    }
    if (!(unitPrice >= 0)) {
      toast.error("单价无效");
      return;
    }
    const p = products.find((x) => x.id === productId);
    const name = p ? `${p.name_en}${p.name_zh ? ` (${p.name_zh})` : ""}` : `#${productId}`;
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
      toast.error("请先添加商品");
      return;
    }
    setSubmitting(true);
    try {
      await createSale({
        items: draft.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
        note: note || null,
      });
      toast.success(`销售出库成功，合计 ${formatCurrency(grandTotal)}`);
      setDraft([]);
      setNote("");
      void loadOrders(1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "销售出库失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVoid(order: SaleSummary) {
    const ok = await confirm({
      title: "作废销售单",
      message: `确认作废 ${order.orderNo}？此操作会把已售出的库存回补，且不可撤销。`,
      confirmText: "作废并回补",
      danger: true,
    });
    if (!ok) return;
    try {
      await voidSale(order.id);
      toast.success("销售单已作废，库存已回补");
      void loadOrders(page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "作废失败");
    }
  }

  return (
    <div className="space-y-4">
      {/* 新建销售单 */}
      <Card>
        <h2 className="mb-3 text-lg font-bold">新建销售单（收银出库）</h2>
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <Select value={selProduct} onChange={(e) => onSelectProduct(e.target.value)} aria-label="选择商品">
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
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="单价"
            className="w-28"
            aria-label="单价"
          />
          <Button onClick={addLine}>
            <Plus size={16} /> 添加
          </Button>
        </div>

        {draft.length > 0 ? (
          <div className="mt-3 space-y-3">
            <Table>
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-600">
                  <th className="px-3 py-2">商品</th>
                  <th className="px-3 py-2">数量</th>
                  <th className="px-3 py-2">单价</th>
                  <th className="px-3 py-2">小计</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {draft.map((line) => (
                  <tr key={line.productId} className="border-t border-slate-100 text-sm">
                    <td className="px-3 py-2">{line.name}</td>
                    <td className="px-3 py-2">{line.quantity}</td>
                    <td className="px-3 py-2">{formatCurrency(line.unitPrice)}</td>
                    <td className="px-3 py-2">{formatCurrency(line.quantity * line.unitPrice)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" onClick={() => removeLine(line.productId)} aria-label="移除">
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="备注（可选）"
                className="max-w-xs"
              />
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-600">
                  合计：<span className="text-lg font-bold text-pine">{formatCurrency(grandTotal)}</span>
                </span>
                <Button onClick={() => void submitSale()} disabled={submitting}>
                  {submitting ? "提交中…" : "提交销售"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">选择商品并点「添加」开始一笔销售。</p>
        )}
      </Card>

      {/* 销售记录 */}
      <Card>
        <h2 className="mb-3 text-lg font-bold">销售记录</h2>
        {loading ? (
          <SkeletonTable rows={5} columns={5} />
        ) : error ? (
          <div className="space-y-2 text-sm">
            <p className="text-rose-600">{error}</p>
            <Button variant="ghost" onClick={() => void loadOrders(page)}>
              重试
            </Button>
          </div>
        ) : orders.length === 0 ? (
          <EmptyState title="暂无销售记录" description="完成一笔销售后会显示在这里。" />
        ) : (
          <>
            <Table>
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-600">
                  <th className="px-3 py-2">单号</th>
                  <th className="px-3 py-2">金额</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">操作员</th>
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100 text-sm">
                    <td className="px-3 py-2 font-medium">{o.orderNo}</td>
                    <td className="px-3 py-2">{formatCurrency(o.total)}</td>
                    <td className="px-3 py-2">
                      {o.status === "voided" ? (
                        <Badge tone="danger">已作废</Badge>
                      ) : (
                        <Badge tone="success">已完成</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">{o.soldBy || "-"}</td>
                    <td className="px-3 py-2">{formatDateTime(o.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin && o.status === "completed" ? (
                        <Button variant="ghost" onClick={() => void handleVoid(o)}>
                          作废
                        </Button>
                      ) : null}
                    </td>
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
    </div>
  );
}
