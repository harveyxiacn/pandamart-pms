import { useEffect, useState } from "react";
import { adjustInventory, getInventory, getInventoryLogs, setSafeStock } from "../api/inventory";
import type { InventoryItem } from "../types";
import { Card } from "../components/ui/Card";
import { Table } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { usePermission } from "../hooks/usePermission";
import { useDebounce } from "../hooks/useDebounce";
import { formatDateTime } from "../utils/formatters";
import { Boxes } from "lucide-react";

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

export default function InventoryPage() {
  const { canAdjustInventory, canAdjustSafeStock } = usePermission();
  const toast = useToast();
  const [keyword, setKeyword] = useState("");
  const [alertOnly, setAlertOnly] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionProduct, setActionProduct] = useState<InventoryItem | null>(null);
  const [actionType, setActionType] = useState<"adjust" | "out" | "stocktake">("adjust");
  const [actionQty, setActionQty] = useState(0);
  const [actionReason, setActionReason] = useState("");
  const [safeStockValue, setSafeStockValue] = useState<number>(0);
  const [logs, setLogs] = useState<InventoryLog[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInventory({ pageSize: 200, keyword: keyword || undefined, alertOnly });
      setItems(data.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载库存失败");
    } finally {
      setLoading(false);
    }
  };

  const debouncedKeyword = useDebounce(keyword, 400);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, alertOnly]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-full text-sm md:w-72">
            关键词
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load();
              }}
              placeholder="产品名 / SKU"
            />
          </label>
          <label className="text-sm">
            <span className="mb-2 block">低库存</span>
            <input type="checkbox" checked={alertOnly} onChange={(e) => setAlertOnly(e.target.checked)} />
          </label>
          <Button onClick={() => void load()}>查询</Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">库存总览</h2>
        {loading ? <SkeletonTable rows={6} columns={5} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={Boxes}
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
          <EmptyState icon={Boxes} title="暂无库存" description="没有符合条件的库存记录。可尝试清除筛选条件，或确认入库发票后库存会自动更新。" />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <Table>
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="px-3 py-2">产品</th>
                <th className="px-3 py-2">当前库存</th>
                <th className="px-3 py-2">安全库存</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {item.product.nameZh || item.product.nameEn}
                    <div className="text-xs text-slate-500">{item.product.sku || "-"}</div>
                  </td>
                  <td className="px-3 py-2">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-3 py-2">{item.safeStock ?? "-"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={item.isLowStock ? "warning" : "success"}>
                      {item.isLowStock ? "低库存" : "正常"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {canAdjustInventory ? (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            setActionProduct(item);
                            setSafeStockValue(item.safeStock ?? 0);
                            const logRes = await getInventoryLogs(item.product.id, { pageSize: 10 });
                            setLogs(logRes.items as InventoryLog[]);
                          }}
                        >
                          调整
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      <Modal open={canAdjustInventory && actionProduct !== null} title="库存调整" onClose={() => setActionProduct(null)}>
        {actionProduct ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">{actionProduct.product.nameZh || actionProduct.product.nameEn}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <label>
                类型
                <Select value={actionType} onChange={(e) => setActionType(e.target.value as typeof actionType)}>
                  <option value="adjust">调整</option>
                  <option value="out">出库</option>
                  <option value="stocktake">盘点</option>
                </Select>
              </label>
              <label>
                数量变化
                <Input type="number" value={actionQty} onChange={(e) => setActionQty(Number(e.target.value))} />
              </label>
              <label>
                原因
                <Input value={actionReason} onChange={(e) => setActionReason(e.target.value)} />
              </label>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  if (!canAdjustInventory) return;
                  try {
                    await adjustInventory(actionProduct.product.id, {
                      type: actionType,
                      quantity: actionQty,
                      reason: actionReason,
                    });
                    toast.success("库存已调整");
                    await load();
                    setActionProduct(null);
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "库存调整失败");
                  }
                }}
              >
                提交调整
              </Button>
            </div>

            {canAdjustSafeStock ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 font-medium">设置安全库存</p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={safeStockValue}
                    onChange={(e) => setSafeStockValue(Number(e.target.value))}
                  />
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await setSafeStock(actionProduct.product.id, safeStockValue);
                        toast.success("安全库存已保存");
                        await load();
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : "安全库存保存失败");
                      }
                    }}
                  >
                    保存
                  </Button>
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 font-medium">最近库存日志</p>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-200 bg-white p-2">
                {logs.length === 0 ? (
                  <p className="text-xs text-slate-500">暂无日志</p>
                ) : (
                  logs.map((log) => (
                    <p key={log.id} className="text-xs text-slate-700">
                      [{formatDateTime(log.createdAt)}] {log.type} {log.quantity} ({log.quantityBefore} → {log.quantityAfter})
                    </p>
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
