import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  ClipboardCheck,
  PackageSearch,
  RotateCcw,
  Save,
} from "lucide-react";
import { getAllInventory, submitStocktake } from "../api/inventory";
import type { InventoryItem } from "../types";
import { Card, CardHeader } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Input, Textarea } from "../components/ui/Input";
import { SearchInput } from "../components/ui/SearchInput";
import { Field } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { Table, Td, Th } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { Toolbar, ToolbarGroup } from "../components/ui/Toolbar";
import { cn } from "../utils/classnames";

type DraftItem = {
  actualQuantity: number;
  notes: string;
};

export default function StocktakePage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState<Record<number, DraftItem>>({});
  const [globalNotes, setGlobalNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // 跨页拉取全部库存行：服务端 pageSize 上限 100，直接请求 500 只会盘到前 100 个商品，
      // 会静默漏盘其余商品。
      const items = await getAllInventory({ keyword: keyword || undefined });
      setInventory(items);
      setDraft((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.product.id]) {
            next[item.product.id] = { actualQuantity: item.quantity, notes: "" };
          }
        }
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "盘点数据加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changedItems = useMemo(() => {
    return inventory
      .map((item) => {
        const row = draft[item.product.id];
        const actualQuantity = row ? Number(row.actualQuantity) : item.quantity;
        return {
          productId: item.product.id,
          actualQuantity,
          systemQuantity: item.quantity,
          notes: row?.notes || "",
          changed: actualQuantity !== item.quantity,
          productName: item.product.nameZh || item.product.nameEn,
        };
      })
      .filter((row) => row.changed);
  }, [inventory, draft]);

  const netDifference = changedItems.reduce(
    (sum, item) => sum + (item.actualQuantity - item.systemQuantity),
    0
  );
  const surplusCount = changedItems.filter((item) => item.actualQuantity > item.systemQuantity).length;
  const shortageCount = changedItems.length - surplusCount;

  const resetDraft = () => {
    const reset: Record<number, DraftItem> = {};
    for (const item of inventory) {
      reset[item.product.id] = { actualQuantity: item.quantity, notes: "" };
    }
    setDraft(reset);
    setGlobalNotes("");
    setMessage("已重置盘点草稿。");
    setError(null);
  };

  const submit = async () => {
    if (changedItems.length === 0) {
      setMessage("没有变化，无需提交。");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await submitStocktake({
        notes: globalNotes,
        items: changedItems.map((item) => ({
          productId: item.productId,
          actualQuantity: item.actualQuantity,
          systemQuantity: item.systemQuantity,
          notes: item.notes,
        })),
      });
      setMessage(`盘点完成：已调整 ${result.adjustedCount} 个产品。`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "提交盘点失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="库存盘点"
        description="逐项录入实际库存，提交后系统会按差异调整库存并记录盘点日志。"
        meta={loading ? "正在加载盘点明细…" : `本次载入 ${inventory.length} 个商品`}
        actions={
          <Button leadingIcon={Save} onClick={() => void submit()} loading={saving} disabled={loading}>
            提交盘点
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="变更条目"
          value={changedItems.length}
          icon={ClipboardCheck}
          tone={changedItems.length > 0 ? "accent" : "neutral"}
          hint={`盘盈 ${surplusCount} · 盘亏 ${shortageCount}`}
        />
        <StatCard
          label="净差异"
          value={`${netDifference > 0 ? "+" : ""}${netDifference}`}
          icon={ArrowUpDown}
          tone={netDifference === 0 ? "neutral" : netDifference > 0 ? "success" : "danger"}
          hint="实际库存 − 系统库存"
        />
        <StatCard
          label="未变更商品"
          value={Math.max(inventory.length - changedItems.length, 0)}
          icon={PackageSearch}
          tone="neutral"
          hint="账面与实物一致"
        />
      </section>

      <Card>
        <Toolbar stacked>
          <ToolbarGroup grow>
            <div className="w-full sm:max-w-xs">
              <SearchInput
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onClear={() => setKeyword("")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void load();
                }}
                placeholder="产品名 / SKU"
                aria-label="按产品关键词查询"
              />
            </div>
            <Button variant="secondary" onClick={() => void load()}>
              查询
            </Button>
          </ToolbarGroup>
          <ToolbarGroup>
            <Button variant="ghost" leadingIcon={RotateCcw} onClick={resetDraft} disabled={saving || loading}>
              重置草稿
            </Button>
          </ToolbarGroup>
        </Toolbar>
      </Card>

      {message ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-success/20 bg-success-soft px-4 py-2.5 text-sm text-success"
        >
          <CheckCircle2 size={15} aria-hidden="true" />
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger"
        >
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            重试
          </Button>
        </div>
      ) : null}

      <Card padded={false} className="p-4 sm:p-5">
        <CardHeader
          title="盘点明细"
          description="只提交有变化的条目，备注用于说明破损、报损或补记原因。"
          className="mb-3"
          action={
            <span className="text-meta text-ink-subtle">
              变更条目 <span className="font-semibold tabular text-ink">{changedItems.length}</span>
            </span>
          }
        />

        {loading ? <SkeletonTable rows={6} columns={5} /> : null}
        {!loading && !error && inventory.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="没有匹配的商品"
            description="调整关键词后重新查询，或先在商品模块中建立商品档案。"
          />
        ) : null}

        {!loading && inventory.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>产品</Th>
                <Th numeric>系统库存</Th>
                <Th>实际库存</Th>
                <Th numeric>差异</Th>
                <Th>备注</Th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const row = draft[item.product.id] || { actualQuantity: item.quantity, notes: "" };
                const diff = Number(row.actualQuantity) - item.quantity;
                return (
                  <tr key={item.id}>
                    <Td>
                      <p className="cell-strong">{item.product.nameZh || item.product.nameEn}</p>
                      <p className="font-mono text-meta text-ink-subtle">{item.product.sku || "—"}</p>
                    </Td>
                    <Td numeric className="text-ink-muted">
                      {item.quantity} {item.unit}
                    </Td>
                    <Td className="w-32">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.actualQuantity}
                        aria-label={`${item.product.nameZh || item.product.nameEn} 实际库存`}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [item.product.id]: {
                              ...row,
                              actualQuantity: Number(e.target.value),
                            },
                          }))
                        }
                        className="h-8 w-28 text-right tabular"
                      />
                    </Td>
                    <Td numeric>
                      <span
                        className={cn(
                          "font-semibold",
                          diff === 0 ? "text-ink-subtle" : diff > 0 ? "text-success" : "text-danger"
                        )}
                      >
                        {diff > 0 ? "+" : ""}
                        {diff}
                      </span>
                    </Td>
                    <Td className="min-w-[12rem]">
                      <Input
                        value={row.notes}
                        aria-label={`${item.product.nameZh || item.product.nameEn} 盘点备注`}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [item.product.id]: { ...row, notes: e.target.value },
                          }))
                        }
                        placeholder="例如：破损 / 报损 / 补记"
                        className="h-8"
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : null}

        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="全局备注" htmlFor="stocktake-notes" hint="本次盘点的整体说明，会写入盘点日志。">
            <Textarea
              id="stocktake-notes"
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
              rows={2}
              placeholder="例如：10 月月末盘点，冷藏区温度异常已单独记录"
            />
          </Field>
          <div className="flex gap-2 sm:pb-0">
            <Button
              onClick={() => void submit()}
              loading={saving}
              disabled={loading || changedItems.length === 0}
              leadingIcon={Save}
            >
              {saving ? "提交中…" : `提交盘点${changedItems.length ? ` (${changedItems.length})` : ""}`}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
