import { useEffect, useMemo, useState } from "react";
import { getInventory, submitStocktake } from "../api/inventory";
import type { InventoryItem } from "../types";
import { Card } from "../components/ui/Card";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Table } from "../components/ui/Table";

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
      const result = await getInventory({ pageSize: 500, keyword: keyword || undefined });
      setInventory(result.items);
      setDraft((prev) => {
        const next = { ...prev };
        for (const item of result.items) {
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

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-bold">库存盘点</h2>
        <p className="mt-1 text-sm text-slate-600">输入实际库存，提交后会自动记录盘点差异日志。</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="w-full text-sm md:w-80">
            产品关键词
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="产品名 / SKU" />
          </label>
          <Button onClick={() => void load()}>查询</Button>
        </div>
      </Card>

      {message ? <Card className="text-emerald-700">{message}</Card> : null}
      {error ? <Card className="text-rose-700">{error}</Card> : null}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">盘点明细</h3>
          <div className="text-sm text-slate-600">变更条目: {changedItems.length}</div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : (
          <Table>
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="px-3 py-2">产品</th>
                <th className="px-3 py-2">系统库存</th>
                <th className="px-3 py-2">实际库存</th>
                <th className="px-3 py-2">差异</th>
                <th className="px-3 py-2">备注</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const row = draft[item.product.id] || { actualQuantity: item.quantity, notes: "" };
                const diff = Number(row.actualQuantity) - item.quantity;
                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {item.product.nameZh || item.product.nameEn}
                      <div className="text-xs text-slate-500">{item.product.sku || "-"}</div>
                    </td>
                    <td className="px-3 py-2">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={row.actualQuantity}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [item.product.id]: {
                              ...row,
                              actualQuantity: Number(e.target.value),
                            },
                          }))
                        }
                      />
                    </td>
                    <td className={`px-3 py-2 font-semibold ${diff === 0 ? "text-slate-500" : diff > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.notes}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [item.product.id]: { ...row, notes: e.target.value },
                          }))
                        }
                        placeholder="例如：破损/报损/补记"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <label className="mt-3 block text-sm">
          全局备注
          <Input value={globalNotes} onChange={(e) => setGlobalNotes(e.target.value)} />
        </label>

        <div className="mt-3 flex gap-2">
          <Button
            onClick={async () => {
              if (changedItems.length === 0) {
                setMessage("没有变化，无需提交。");
                return;
              }
              setSaving(true);
              setMessage(null);
              setError(null);
              try {
                const payload = {
                  notes: globalNotes,
                  items: changedItems.map((item) => ({
                    productId: item.productId,
                    actualQuantity: item.actualQuantity,
                    systemQuantity: item.systemQuantity,
                    notes: item.notes,
                  })),
                };
                const result = await submitStocktake(payload);
                setMessage(`盘点完成：已调整 ${result.adjustedCount} 个产品。`);
                await load();
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "提交盘点失败");
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving || loading}
          >
            {saving ? "提交中..." : "提交盘点"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const resetDraft: Record<number, DraftItem> = {};
              for (const item of inventory) {
                resetDraft[item.product.id] = { actualQuantity: item.quantity, notes: "" };
              }
              setDraft(resetDraft);
              setGlobalNotes("");
              setMessage("已重置盘点草稿。");
            }}
            disabled={saving || loading}
          >
            重置草稿
          </Button>
        </div>
      </Card>
    </div>
  );
}
